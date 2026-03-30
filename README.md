# mcp-server-agentpay

<a href="https://glama.ai/mcp/servers/@joepangallo/mcp-server-agentpay"><img width="380" height="200" src="https://glama.ai/mcp/servers/@joepangallo/mcp-server-agentpay/badge" alt="AgentPay MCP server" /></a>

MCP server for **AgentPay** — the payment gateway for autonomous AI agents.

Fund a wallet once, give your agent the key, and it discovers, provisions, and pays for tool APIs on its own. One key, every tool.

## Quick Setup

```bash
# Add to Claude Code
claude mcp add agentpay -- npx mcp-server-agentpay

# Set your gateway key
export AGENTPAY_GATEWAY_KEY="apg_your_key_here"
```

Or add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "agentpay": {
      "command": "npx",
      "args": ["-y", "mcp-server-agentpay"],
      "env": {
        "AGENTPAY_GATEWAY_KEY": "apg_your_key_here"
      }
    }
  }
}
```

## Get a Gateway Key

```bash
curl -X POST https://pay.leddconsulting.com/gateway/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'
```

You get $1 in free credits to start.

## Tools

| Tool | Description |
|------|-------------|
| `discover_tools` | Search tools by keyword (e.g. 'security', 'seo') |
| `list_tools` | List all available tools with pricing |
| `check_balance` | Check wallet balance and provisioned tools |
| `call_tool` | Call any tool method (metered, auto-provisions) |
| `provision_tool` | Pre-provision access to a tool |
| `get_usage` | View recent call history and costs |
| `fund_wallet_stripe` | Get Stripe checkout URL for credits |
| `fund_wallet_x402` | Get x402 crypto funding info (autonomous USDC) |
| `x402_info` | View x402 payment options and setup |

### Admin Tools (optional, requires `AGENTPAY_ADMIN_KEY`)

| Tool | Description |
|------|-------------|
| `reliability_dashboard` | Circuit breaker states, health metrics, recent events |
| `reliability_tool_detail` | Detailed reliability info for a specific tool |
| `reliability_reset` | Force-close a tripped circuit breaker |
| `reliability_config` | Update circuit breaker settings |

## How It Works

1. **Register** — create a wallet, get a gateway key
2. **Fund** — add credits via Stripe or x402 USDC
3. **Discover** — agent searches for tools by capability
4. **Call** — agent calls any tool, gateway handles auth + billing

The agent never needs to know about individual tool APIs, accounts, or payment. One key, every tool.

## Funding Methods

### Stripe (human-in-the-loop)
Use `fund_wallet_stripe` — returns a checkout URL for a human to complete.

### x402 USDC (fully autonomous)
Use `fund_wallet_x402` — returns endpoint, network, and instructions for autonomous USDC payments via the [x402 protocol](https://www.x402.org/). No human needed.

### Credit Packages

| Package | Price | Credits |
|---------|-------|---------|
| micro   | $10   | 10      |
| small   | $45   | 50      |
| medium  | $80   | 100     |
| large   | $350  | 500     |
| whale   | $600  | 1,000   |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTPAY_GATEWAY_KEY` | Yes | Your gateway API key (starts with `apg_`) |
| `AGENTPAY_ADMIN_KEY` | No | Admin key for reliability endpoints |
| `AGENTPAY_URL` | No | Custom gateway URL (default: `https://pay.leddconsulting.com`) |

## Available Tools (via gateway)

- **Security Audit** — scan websites for vulnerabilities, SSL issues, OWASP risks
- **IndexForge SEO** — submit URLs to Google/Bing, scan sitemaps, check index status

More tools added regularly. Developers can register tools at the [marketplace](https://pay.leddconsulting.com/docs).

## Links

- [API Docs](https://pay.leddconsulting.com/docs)
- [Status Page](https://pay.leddconsulting.com/status)
- [MCP Registry](https://registry.modelcontextprotocol.io) — `io.github.joepangallo/agent-pay`

## License

MIT

## Hosted deployment

A hosted deployment is available on [Fronteir AI](https://fronteir.ai/mcp/joepangallo-mcp-server-agentpay).

