# TRR Smart Search — a browser extension for The RealReal

## The problem

The RealReal's own search and "you might also like" recommendations are weak:
no real natural-language search ("white linen short dress" doesn't work),
recommendations aren't filtered to my size, and they don't reflect my actual taste.

## Approach: browser companion extension (not a scraper)

This extension runs only on pages I'm already viewing in my own browser. It reads
what's already loaded on the page and re-ranks/filters it. It does not crawl or
store a copy of TRR's catalog anywhere. This is a meaningfully safer design than
building a standalone app backed by a scraped database — TRR's terms of service
almost certainly prohibit automated bulk scraping, like nearly every retailer's do.
An extension that enhances a page I've already loaded, with no server-side copy of
their catalog, is a materially different (and much more defensible) thing.

## Key discovery: the data is already on the page, structured

The RealReal is a Next.js app. Every listing/category page embeds a
`<script id="__NEXT_DATA__" type="application/json">` tag containing the full,
structured data used to render the page — before any of it becomes HTML. This
means the extension should read `__NEXT_DATA__` directly instead of scraping
rendered DOM text or CSS classes (which are auto-generated build hashes, e.g.
`css-qtk657`, and will silently break on TRR's next deploy).

Path to the data:
```
JSON.parse(document.getElementById('__NEXT_DATA__').textContent)
  .props.pageProps.serverResult.data.products.edges[].node
```

Example product node (captured live from a real dresses listing page):
```json
{
  "name": "Mock Neck Mini Dress",
  "brandUnion": { "name": "Saffiya" },
  "price": {
    "final": { "formatted": "$135.00", "usdCents": 13500 }
  },
  "attributes": [
    { "label": "Clothing Size", "type": "CLOTHING_SIZE", "values": ["L"] },
    { "label": "Color", "type": "COLOR", "values": ["Purple"] },
    { "label": "Condition", "type": "CONDITION", "values": ["Excellent"] },
    { "label": "Silhouette Dresses", "type": "SILHOUETTE_DRESSES", "values": ["Casual Dress"] }
  ],
  "url": "https://www.therealreal.com/products/women/clothing/dresses/saffiya-mock-neck-mini-dress-vtfe5",
  "images": [{ "url": "https://product-images.therealreal.com/SAFYA20147_1_enlarged.jpg" }],
  "sku": "...",
  "availability": "AVAILABLE",
  "obsessed": false,
  "obsessionCount": 5
}
```

Also present in `providerData` on these pages: a `MySizes` object (populated when
signed in). Worth investigating in a later phase — TRR may already store the
user's saved sizes, which could save us from building our own size-profile UI.

### Known open question — needs live investigation

`?keywords=` in the URL does nothing (confirmed: it's silently ignored, the page
still returns the full unfiltered category). Real search goes through the
interactive search bar and fires its own request — almost certainly a GraphQL
call, same shape as the category query but with a text field added to the `where`
clause. To find it: open a TRR page, DevTools → Network tab → filter by
`graphql`, then type a real search and inspect the request payload and response
shape. Do this before building the search-box feature — it determines whether v1
only re-ranks whatever's currently rendered, or can also drive TRR's own
full-catalog search.

Heads up: TRR shows an aggressive email-signup modal that fires on a timer —
not just on click — so it can appear mid-interaction and steal focus/keystrokes
away from whatever you were typing into (confirmed live: it hijacked a search
query straight into its email field). Any script that types into the page,
including the extension's own future automated tests, should check for and
dismiss this modal (and the cookie-consent modal, which appears first) before
interacting with anything else, and probably re-check after every action rather
than only once on page load.

## v1 scope: smarter search only

Everything else (size filtering, personalized recs) is a later phase. Don't build
them yet.

**Flow:**
1. Extension detects a TRR listing/search page.
2. Reads `__NEXT_DATA__`, extracts the product list (name, brand, attributes, price, url, image).
3. Injects a search box above the results grid.
4. On query submit: build a short text string per visible product (name + brand + attribute values), get embeddings for the query and every product string, rank by cosine similarity.
5. Reorder the actual DOM product cards to match the ranked order (map back from the structured data to DOM nodes via the product `url`, which also appears as the card's link `href`).
6. As more items load (infinite scroll), re-run steps 2–5 on newly added cards (`MutationObserver`).

## Architecture

No backend server needed for v1. Three pieces, all in one extension:

- **Content script** — runs on therealreal.com pages. Reads `__NEXT_DATA__`, injects the search UI, reorders the DOM.
- **Background service worker** — makes the embedding API call (kept separate from the content script to sidestep the page's CSP on outbound fetches).
- **Options page** — where I paste an API key for an embeddings provider (Voyage, OpenAI, or Cohere all have cheap/free tiers — a few cents per search at most). Stored via `chrome.storage`.

Manifest V3. Plain JavaScript is fine for v1 — no framework needed for a single injected search box.

## Build order

1. Bare-bones extension that loads on therealreal.com and logs the parsed product list from `__NEXT_DATA__` to the console. No API calls yet — just confirm the data read works.
2. Manually find the real search GraphQL request via DevTools (see open question above) and decide whether v1 reranks in place or also drives TRR's own search.
3. Inject the search box UI above the results grid.
4. Wire up the embedding API call and cosine-similarity ranking for whatever's currently rendered.
5. Reorder the DOM based on scores.
6. Handle infinite scroll with a `MutationObserver` so new cards get ranked as they load.

## Future phases (not v1)

- **Size-aware filtering**: straightforward once v1 exists — filter/sort using `attributes` where `type === "CLOTHING_SIZE"` against a saved profile of my sizes per category. Check whether `providerData.MySizes` can be read directly when signed in, before building a separate size-profile UI.
- **Personalized recommendations**: track items I mark as liked (local storage), embed their text/images, rank new listings by similarity to that set. `obsessionCount` on each product (TRR's own "favorite" counter) could be a secondary signal but it's aggregate across all users, not personal.

## Explicitly out of scope

- No server-side database of TRR's catalog.
- No bulk crawling across many pages/categories in the background.
- No republishing or public hosting of TRR product data.
