# The Signal — UX Feed (Netlify)

A personal UX news feed with a live "Refresh feeds" button backed by a
serverless RSS parser — no AI in the loop, no browser CORS issues, no
connector registration needed.

## Structure

- `public/index.html` — the page (categories, manual add/edit/remove, filters, refresh button)
- `netlify/functions/rss.js` — serverless function that fetches + parses RSS/Atom feeds server-side
- `netlify.toml` — routes `/api/rss` to the function, sets the publish dir

## Deploy

```bash
cd netlify-site
npx netlify-cli deploy --prod
```

(First run will prompt you to log in and either link an existing Netlify site
or create a new one.)

Once live, your site calls its own `/api/rss?feeds=...` endpoint — same
origin, no CORS problems — which fetches the actual RSS feeds server-side and
returns parsed JSON.

## Feeds tracked

Edit the `FEEDS` array near the top of the `<script>` in `public/index.html`
to add, remove, or recategorize sources:

```js
var FEEDS = [
  { url: 'https://www.smashingmagazine.com/feed/', cat: 'Craft & Interaction' },
  { url: 'https://www.nngroup.com/feed/rss/', cat: 'Strategy & Teams' },
  { url: 'https://uxdesign.cc/feed', cat: 'AI & Agentic' }
];
```

## How "daily" works

The page auto-calls refresh once per visit if it's been more than 24 hours
since the last refresh (tracked in that browser's local storage), and there's
also a manual "Refresh feeds" button. Live articles are marked with a dashed
"· live" tag and can't be individually deleted (they're re-fetched each
refresh); manually added articles are separate and fully editable.

Note: live articles and manual additions still save to each visitor's own
browser (localStorage) — this isn't a shared/synced backend. Two people
visiting the site get the same live RSS pull, but their manual edits and
category renames stay local to them.
