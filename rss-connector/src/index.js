// Minimal MCP server (Streamable HTTP, JSON responses) exposing one tool:
// get_latest_articles — fetches and parses RSS/Atom feeds, no AI involved.

const SERVER_INFO = { name: "ux-feed-rss-connector", version: "1.0.0" };

const TOOLS = [
  {
    name: "get_latest_articles",
    description:
      "Fetch and parse RSS/Atom feeds and return their latest entries (title, link, source, publish date, summary). Purely mechanical XML parsing, no AI summarization.",
    inputSchema: {
      type: "object",
      properties: {
        feedUrls: {
          type: "array",
          items: { type: "string" },
          description: "List of RSS/Atom feed URLs to fetch.",
        },
        perFeedLimit: {
          type: "number",
          description: "Max entries to return per feed (default 8).",
        },
      },
      required: ["feedUrls"],
    },
  },
];

function xmlUnescape(str) {
  return (str || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function tagValue(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? xmlUnescape(m[1]) : "";
}

function atomLink(block) {
  const m = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1] : "";
}

function parseFeed(xml, perFeedLimit) {
  const feedTitleMatch = xml.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i);
  const feedTitle = feedTitleMatch ? xmlUnescape(feedTitleMatch[1]) : "";

  const items = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

  itemBlocks.forEach((block) => {
    items.push({
      title: tagValue(block, "title"),
      link: tagValue(block, "link"),
      pubDate: tagValue(block, "pubDate") || tagValue(block, "dc:date"),
      description: tagValue(block, "description") || tagValue(block, "content:encoded"),
    });
  });

  entryBlocks.forEach((block) => {
    items.push({
      title: tagValue(block, "title"),
      link: atomLink(block) || tagValue(block, "id"),
      pubDate: tagValue(block, "updated") || tagValue(block, "published"),
      description: tagValue(block, "summary") || tagValue(block, "content"),
    });
  });

  return {
    source: feedTitle,
    items: items.slice(0, perFeedLimit || 8).map((it) => ({
      title: it.title,
      link: it.link,
      source: feedTitle,
      pubDate: it.pubDate,
      description: it.description ? it.description.slice(0, 280) : "",
    })),
  };
}

async function getLatestArticles({ feedUrls, perFeedLimit }) {
  const results = await Promise.all(
    (feedUrls || []).map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "ux-feed-rss-connector/1.0" },
        });
        if (!res.ok) return { url, error: `HTTP ${res.status}` };
        const xml = await res.text();
        const parsed = parseFeed(xml, perFeedLimit);
        return { url, source: parsed.source, items: parsed.items };
      } catch (err) {
        return { url, error: String(err && err.message ? err.message : err) };
      }
    })
  );
  return results;
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleRpc(body) {
  const { id, method, params } = body;

  if (method === "initialize") {
    return jsonRpcResult(id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }

  if (method === "notifications/initialized") {
    return null; // no response for notifications
  }

  if (method === "tools/list") {
    return jsonRpcResult(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    if (name === "get_latest_articles") {
      const data = await getLatestArticles(args);
      return jsonRpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(data) }],
      });
    }
    return jsonRpcError(id, -32601, `Unknown tool: ${name}`);
  }

  return jsonRpcError(id, -32601, `Unknown method: ${method}`);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== "/mcp") {
      return new Response("ux-feed-rss-connector: POST JSON-RPC to /mcp", { status: 200 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return Response.json(jsonRpcError(null, -32700, "Parse error"), { status: 400 });
    }

    const messages = Array.isArray(body) ? body : [body];
    const responses = [];
    for (const msg of messages) {
      const r = await handleRpc(msg);
      if (r) responses.push(r);
    }

    if (responses.length === 0) {
      return new Response(null, { status: 202 });
    }
    return Response.json(Array.isArray(body) ? responses : responses[0]);
  },
};
