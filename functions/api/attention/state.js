import { json, foldCached, foldAndCache } from "../../_shared/attn.js";

/* Served from the fold cache (see _shared/attn.js) — one indexed row instead of a full scan of
   both attention tables. `?fresh=1` bypasses the cache and rebuilds it, for when you need to be
   certain you are looking at the database and not a stored fold. */
export async function onRequestGet(ctx) {
  const fresh = new URL(ctx.request.url).searchParams.get("fresh") === "1";
  try { return json(await (fresh ? foldAndCache : foldCached)(ctx.env.DB)); }
  catch (e) { return json({ error: `fold unavailable: ${e.name}: ${e.message}` }, 503); }
}
