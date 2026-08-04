// Serverless RSS/Atom fetcher + parser. Purely mechanical — no AI involved.
// Runs on Netlify's side so browser CORS restrictions don't apply.

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

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const feedsParam = params.feeds || "";
  const perFeedLimit = Number(params.limit) || 8;
  const feedUrls = feedsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!feedUrls.length) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Provide ?feeds=url1,url2" }),
    };
  }

  const results = await Promise.all(
    feedUrls.map(async (feedUrl) => {
      try {
        const res = await fetch(feedUrl, {
          headers: { "User-Agent": "ux-feed-netlify-function/1.0" },
        });
        if (!res.ok) return { url: feedUrl, error: `HTTP ${res.status}` };
        const xml = await res.text();
        const parsed = parseFeed(xml, perFeedLimit);
        return { url: feedUrl, source: parsed.source, items: parsed.items };
      } catch (err) {
        return { url: feedUrl, error: String(err && err.message ? err.message : err) };
      }
    })
  );

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=1800",
    },
    body: JSON.stringify({ feeds: results }),
  };
};
