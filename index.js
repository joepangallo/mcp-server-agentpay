#!/usr/bin/env node

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const https = require("https");
const http = require("http");
const { version } = require("./package.json");

// ── Config ──────────────────────────────────────────────────────────

const GATEWAY_KEY = process.env.AGENTPAY_GATEWAY_KEY || "";
const ADMIN_KEY = process.env.AGENTPAY_ADMIN_KEY || "";
const BASE_URL = (process.env.AGENTPAY_URL || "https://pay.leddconsulting.com").replace(/\/$/, "");

// ── HTTP helper ─────────────────────────────────────────────────────

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB

function request(method, urlPath, body, timeout = 120_000) {
  return new Promise((resolve, reject) => {
    const fullUrl = `${BASE_URL}${urlPath}`;
    const parsed = new URL(fullUrl);
    const isHttps = parsed.protocol === "https:";

    if (!isHttps && GATEWAY_KEY) {
      return reject(new Error("Refusing to send gateway key over insecure HTTP. Use HTTPS."));
    }

    const mod = isHttps ? https : http;

    const headers = {
      "Content-Type": "application/json",
      "User-Agent": `mcp-server-agentpay/${version}`,
    };
    if (GATEWAY_KEY) headers["X-Gateway-Key"] = GATEWAY_KEY;

    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers,
      timeout,
    };

    const req = mod.request(opts, (res) => {
      let data = "";
      let size = 0;
      res.on("data", (c) => {
        size += c.length;
        if (size > MAX_RESPONSE_SIZE) { req.destroy(); return reject(new Error("Response too large")); }
        data += c;
      });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) return reject(new Error(json.error || `HTTP ${res.statusCode}`));
          resolve(json);
        } catch {
          if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          resolve(data);
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function noKeyError() {
  return {
    content: [{ type: "text", text: "Error: AGENTPAY_GATEWAY_KEY environment variable is required.\n\nRegister at https://pay.leddconsulting.com to get a gateway key.\nYou get $1 in free credits to start." }],
  };
}

function noAdminKeyError() {
  return {
    content: [{ type: "text", text: "Error: AGENTPAY_ADMIN_KEY environment variable is required for reliability endpoints.\n\nThis is the admin key configured on the AgentPay server." }],
  };
}

function adminRequest(method, urlPath, body, timeout = 30_000) {
  return new Promise((resolve, reject) => {
    const fullUrl = `${BASE_URL}${urlPath}`;
    const parsed = new URL(fullUrl);
    const isHttps = parsed.protocol === "https:";

    if (!isHttps && ADMIN_KEY) {
      return reject(new Error("Refusing to send admin key over insecure HTTP. Use HTTPS."));
    }

    const mod = isHttps ? https : http;

    const headers = {
      "Content-Type": "application/json",
      "User-Agent": `mcp-server-agentpay/${version}`,
      "Authorization": `Bearer ${ADMIN_KEY}`,
    };

    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers,
      timeout,
    };

    const req = mod.request(opts, (res) => {
      let data = "";
      let size = 0;
      res.on("data", (c) => {
        size += c.length;
        if (size > MAX_RESPONSE_SIZE) { req.destroy(); return reject(new Error("Response too large")); }
        data += c;
      });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) return reject(new Error(json.error || `HTTP ${res.statusCode}`));
          resolve(json);
        } catch {
          if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          resolve(data);
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── MCP Server ──────────────────────────────────────────────────────

const server = new McpServer({
  name: "agentpay",
  version,
});

// ── Tool: discover_tools ────────────────────────────────────────────

server.tool(
  "discover_tools",
  "Search for available AI tools by keyword or capability. Returns matching tools with descriptions, methods, and per-call pricing. Use this to find what tools are available before calling them.",
  {
    query: z.string().describe("Search keyword (e.g. 'security', 'seo', 'indexing', 'vulnerability')"),
  },
  async ({ query }) => {
    try {
      const result = await request("POST", "/gateway/discover", { query });
      if (result.count === 0) {
        return { content: [{ type: "text", text: `No tools found for "${query}". Try: security, seo, indexing, vulnerability, audit` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(result.tools ?? [], null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// ── Tool: list_tools ────────────────────────────────────────────────

server.tool(
  "list_tools",
  "List all available tools in the AgentPay gateway with their descriptions, methods, and pricing. No authentication required.",
  {},
  async () => {
    try {
      const result = await request("GET", "/gateway/tools");
      return { content: [{ type: "text", text: JSON.stringify(result.tools ?? [], null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// ── Tool: check_balance ─────────────────────────────────────────────

server.tool(
  "check_balance",
  "Check your AgentPay wallet balance, total credits funded, total spent, and which tools you have provisioned access to.",
  {},
  async () => {
    if (!GATEWAY_KEY) return noKeyError();
    try {
      const result = await request("GET", "/gateway/balance");
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// ── Tool: call_tool ─────────────────────────────────────────────────

server.tool(
  "call_tool",
  "Call any tool method through the AgentPay gateway. Automatically provisions access on first use. Credits are deducted per call. Use discover_tools or list_tools first to see available tools and methods.",
  {
    tool: z.string().describe("Tool ID (e.g. 'agent-audit', 'indexforge')"),
    method: z.string().describe("Method name (e.g. 'security_scan', 'scan_sitemap')"),
    params_json: z.string().optional().describe("Method parameters as JSON string (e.g. '{\"url\": \"example.com\"}'). Omit if no params needed."),
  },
  async ({ tool, method, params_json }) => {
    if (!GATEWAY_KEY) return noKeyError();
    try {
      let params = {};
      if (params_json) {
        try { params = JSON.parse(params_json); } catch { return { content: [{ type: "text", text: "Error: params_json must be valid JSON" }] }; }
      }
      const result = await request("POST", "/gateway/call", { tool, method, params }, 600_000);
      const cost = Number(result.cost) || 0;
      const balance = Number(result.balance) || 0;
      const meta = `[Cost: $${cost.toFixed(2)} | Balance: $${balance.toFixed(2)} | Time: ${result.elapsed || 0}ms]`;
      return {
        content: [{ type: "text", text: `${meta}\n\n${JSON.stringify(result.result, null, 2)}` }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// ── Tool: provision_tool ────────────────────────────────────────────

server.tool(
  "provision_tool",
  "Pre-provision access to a specific tool. This auto-creates an account on the tool's backend. Not required — call_tool auto-provisions on first use — but useful to confirm access before making calls.",
  {
    tool: z.string().describe("Tool ID to provision (e.g. 'indexforge', 'agent-audit')"),
  },
  async ({ tool }) => {
    if (!GATEWAY_KEY) return noKeyError();
    try {
      const result = await request("POST", "/gateway/provision", { tool });
      return { content: [{ type: "text", text: `${result.status}: ${result.message}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// ── Tool: get_usage ─────────────────────────────────────────────────

server.tool(
  "get_usage",
  "View your recent tool call history — which tools you called, what methods, how much each cost, and when.",
  {
    limit: z.number().int().min(1).max(200).default(20).describe("Number of recent calls to show (default: 20, max: 200)"),
  },
  async ({ limit }) => {
    if (!GATEWAY_KEY) return noKeyError();
    try {
      const result = await request("GET", `/gateway/usage?limit=${limit}`);
      return { content: [{ type: "text", text: JSON.stringify(result.usage ?? [], null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// ── Tool: fund_wallet_stripe ─────────────────────────────────────────

server.tool(
  "fund_wallet_stripe",
  "Get a Stripe checkout URL to add credits. Requires a human to open the link and pay. Use fund_wallet_x402 for fully autonomous crypto payments instead.",
  {
    package: z.enum(["micro", "small", "medium", "large", "whale"]).describe("Credit package: micro ($10/10cr), small ($45/50cr), medium ($80/100cr), large ($350/500cr), whale ($600/1000cr)"),
  },
  async ({ package: pkg }) => {
    if (!GATEWAY_KEY) return noKeyError();
    try {
      const result = await request("POST", "/gateway/fund", { package: pkg });
      return { content: [{ type: "text", text: `Checkout URL (share with a human to complete payment):\n${result.checkoutUrl}\n\nPackage: ${pkg} (${result.credits} credits)` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// ── Tool: fund_wallet_x402 ──────────────────────────────────────────

server.tool(
  "fund_wallet_x402",
  "Get x402 crypto funding info for your wallet. Returns the endpoint URL, network, and setup instructions. To actually pay, your HTTP client needs @x402/fetch which automatically handles the 402 payment flow with USDC. This is the fully autonomous funding method — no human needed.",
  {
    package: z.enum(["micro", "small", "medium", "large", "whale"]).describe("Credit package: micro ($10/10cr), small ($45/50cr), medium ($80/100cr), large ($350/500cr), whale ($600/1000cr)"),
  },
  async ({ package: pkg }) => {
    if (!GATEWAY_KEY) return noKeyError();
    try {
      const info = await request("GET", "/gateway/fund/x402");
      const option = info.options?.find(o => o.package === pkg);
      if (!option) {
        return { content: [{ type: "text", text: `Package "${pkg}" not found. Available: ${info.options?.map(o => o.package).join(", ")}` }] };
      }
      return {
        content: [{
          type: "text",
          text: `x402 Crypto Funding for ${pkg} package (${option.credits} credits, ${option.price} USDC):\n\n` +
            `Endpoint: POST ${BASE_URL}${option.endpoint}\n` +
            `Network: ${option.network}\n` +
            `PayTo: ${option.payTo}\n\n` +
            `To pay autonomously, make an HTTP request to the endpoint above.\n` +
            `If using @x402/fetch, the 402 payment flow is handled automatically:\n\n` +
            `  const fetchWithPayment = wrapFetchWithPayment(fetch, x402Client);\n` +
            `  const res = await fetchWithPayment("${BASE_URL}/gateway/fund/x402/${pkg}", {\n` +
            `    method: "POST",\n` +
            `    headers: { "X-Gateway-Key": "your_key" }\n` +
            `  });\n\n` +
            `The agent's EVM wallet needs USDC on ${option.network}.\n` +
            `Setup: npm install @x402/fetch @x402/evm\n` +
            `Env: EVM_PRIVATE_KEY=0x... (agent wallet with USDC)`,
        }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// ── Tool: x402_info ─────────────────────────────────────────────────

server.tool(
  "x402_info",
  "Get information about x402 crypto payment support — which networks, tokens, and funding options are available for autonomous wallet funding.",
  {},
  async () => {
    try {
      const info = await request("GET", "/gateway/fund/x402");
      return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `x402 not enabled on this gateway. Error: ${e.message}` }] };
    }
  }
);

// ── Tool: reliability_dashboard ────────────────────────────────────

server.tool(
  "reliability_dashboard",
  "View the full reliability dashboard — circuit breaker states, health metrics (latency p50/p95/p99, success rates), and recent events for all tool backends. Requires admin key.",
  {},
  async () => {
    if (!ADMIN_KEY) return noAdminKeyError();
    try {
      const result = await adminRequest("GET", "/admin/reliability");
      const circuits = result.circuits || {};
      const health = result.health || {};
      const events = result.events || [];

      let text = "=== Reliability Dashboard ===\n\n";

      // Circuit states
      text += "CIRCUITS:\n";
      const toolIds = Object.keys(circuits);
      if (toolIds.length === 0) {
        text += "  No circuit data yet (no tool calls made since restart)\n";
      } else {
        for (const id of toolIds) {
          const c = circuits[id];
          text += `  ${id}: ${c.state} (failures: ${c.failureCount}, successes: ${c.successCount})\n`;
        }
      }

      // Health metrics
      text += "\nHEALTH:\n";
      const healthIds = Object.keys(health);
      if (healthIds.length === 0) {
        text += "  No health data yet\n";
      } else {
        for (const id of healthIds) {
          const h = health[id];
          text += `  ${id}: ${h.successRate}% success (${h.requests.total} calls) — latency avg ${h.latency.avg}ms, p95 ${h.latency.p95}ms\n`;
        }
      }

      // Recent events
      if (events.length > 0) {
        text += `\nRECENT EVENTS (last ${events.length}):\n`;
        for (const e of events.slice(-10)) {
          const status = e.success ? "OK" : "FAIL";
          text += `  [${e.timestamp}] ${e.toolId}.${e.method} ${status} ${e.latencyMs}ms${e.error ? " — " + e.error : ""}\n`;
        }
        if (events.length > 10) text += `  ... and ${events.length - 10} more\n`;
      }

      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// ── Tool: reliability_tool_detail ─────────────────────────────────

server.tool(
  "reliability_tool_detail",
  "Get detailed reliability info for a specific tool — circuit breaker state, config (thresholds, timeouts), health metrics, and recent events.",
  {
    tool_id: z.string().describe("Tool ID (e.g. 'agent-audit', 'indexforge')"),
  },
  async ({ tool_id }) => {
    if (!ADMIN_KEY) return noAdminKeyError();
    try {
      const result = await adminRequest("GET", `/admin/reliability/${encodeURIComponent(tool_id)}`);
      const c = result.circuit || {};
      const cfg = result.config || {};
      const h = result.health || {};
      const events = result.events || [];

      let text = `=== ${tool_id} Reliability ===\n\n`;
      text += `CIRCUIT: ${c.state} (failures: ${c.failureCount}, successes: ${c.successCount})\n`;
      text += `CONFIG: threshold=${cfg.failureThreshold} failures, recovery=${cfg.recoveryTimeoutMs}ms, timeout=${cfg.requestTimeoutMs}ms\n`;
      text += `HEALTH: ${h.successRate}% success (${h.requests?.total || 0} calls)\n`;
      text += `LATENCY: avg=${h.latency?.avg || 0}ms, p50=${h.latency?.p50 || 0}ms, p95=${h.latency?.p95 || 0}ms, p99=${h.latency?.p99 || 0}ms (${h.latency?.samples || 0} samples)\n`;
      if (h.lastCall) text += `LAST CALL: ${h.lastCall}\n`;

      if (events.length > 0) {
        text += `\nEVENTS (${events.length}):\n`;
        for (const e of events.slice(-20)) {
          const status = e.success ? "OK" : "FAIL";
          text += `  [${e.timestamp}] ${e.method} ${status} ${e.latencyMs}ms${e.error ? " — " + e.error : ""}\n`;
        }
      }

      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// ── Tool: reliability_reset ───────────────────────────────────────

server.tool(
  "reliability_reset",
  "Force-close a tripped circuit breaker for a tool, allowing calls to resume immediately. Use when a backend has recovered but the circuit hasn't automatically reset yet.",
  {
    tool_id: z.string().describe("Tool ID to reset (e.g. 'agent-audit', 'indexforge')"),
  },
  async ({ tool_id }) => {
    if (!ADMIN_KEY) return noAdminKeyError();
    try {
      const result = await adminRequest("POST", `/admin/reliability/${encodeURIComponent(tool_id)}/reset`);
      return { content: [{ type: "text", text: `Circuit reset for ${tool_id}: ${result.previousState} → ${result.currentState}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// ── Tool: reliability_config ──────────────────────────────────────

server.tool(
  "reliability_config",
  "Update reliability settings for a specific tool — failure threshold, recovery timeout, and request timeout. Changes take effect immediately.",
  {
    tool_id: z.string().describe("Tool ID to configure (e.g. 'agent-audit', 'indexforge')"),
    failure_threshold: z.number().int().min(1).max(100).optional().describe("Number of consecutive failures before circuit opens (1-100)"),
    recovery_timeout_ms: z.number().int().min(5000).max(600000).optional().describe("Milliseconds before OPEN circuit tries recovery (5000-600000)"),
    request_timeout_ms: z.number().int().min(1000).max(600000).optional().describe("Per-request timeout in milliseconds (1000-600000)"),
  },
  async ({ tool_id, failure_threshold, recovery_timeout_ms, request_timeout_ms }) => {
    if (!ADMIN_KEY) return noAdminKeyError();
    const body = {};
    if (failure_threshold !== undefined) body.failureThreshold = failure_threshold;
    if (recovery_timeout_ms !== undefined) body.recoveryTimeoutMs = recovery_timeout_ms;
    if (request_timeout_ms !== undefined) body.requestTimeoutMs = request_timeout_ms;
    if (Object.keys(body).length === 0) {
      return { content: [{ type: "text", text: "Error: Provide at least one setting to update (failure_threshold, recovery_timeout_ms, request_timeout_ms)" }] };
    }
    try {
      const result = await adminRequest("POST", `/admin/reliability/${encodeURIComponent(tool_id)}/config`, body);
      const cfg = result.config || {};
      return { content: [{ type: "text", text: `Config updated for ${tool_id}:\n  failureThreshold: ${cfg.failureThreshold}\n  recoveryTimeoutMs: ${cfg.recoveryTimeoutMs}\n  requestTimeoutMs: ${cfg.requestTimeoutMs}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// ── Start ───────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("MCP server error:", e);
  process.exit(1);
});
