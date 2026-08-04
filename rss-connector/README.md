# UX Feed RSS Connector

A tiny MCP server that fetches and parses RSS/Atom feeds — no AI in the loop,
just XML parsing. Deploy it once, register it as a custom connector in
claude.ai, and the "The Signal" artifact can call it directly for daily
refreshes.

## 1. Deploy

Requires a free Cloudflare account.

```bash
cd rss-connector
npm install
npx wrangler login
npm run deploy
```

Wrangler prints your live URL, e.g.:

```
https://ux-feed-rss-connector.<your-subdomain>.workers.dev
```

Your connector's MCP endpoint is that URL + `/mcp`.

## 2. Register as a custom connector in claude.ai

In claude.ai, go to **Settings → Connectors → Add custom connector**, and
enter:

- **Name**: UX Feed RSS
- **URL**: `https://ux-feed-rss-connector.<your-subdomain>.workers.dev/mcp`

No auth is required — this server only reads public RSS feeds.

## 3. Come back and tell Claude it's connected

Once connected, tell Claude in the ux-feed conversation. It will wire the
artifact's "Add a source" panel (or an automatic refresh button) to call
`get_latest_articles` with the feed URLs you want tracked, e.g.:

- `https://www.smashingmagazine.com/feed/`
- `https://www.nngroup.com/feed/rss/`
- `https://uxdesign.cc/feed`

The tool returns parsed titles, links, sources, dates, and summaries —
mechanically, every time it's called. No AI model runs as part of the fetch.

## What this does / doesn't do

- Does: fetch a feed URL, parse `<item>`/`<entry>` blocks, return structured
  JSON.
- Doesn't: summarize, rank, or rewrite anything — that's just how MCP tool
  calls work; the artifact page decides what to do with the data.
- Doesn't: run on its own schedule. The artifact calls it when the page is
  opened (or on a timer you set in the page), not via a cron job on the
  worker itself.
