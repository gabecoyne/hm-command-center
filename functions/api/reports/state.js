import { json } from "../../_shared/attn.js";
import { foldReportsCached, foldReportsAndCache } from "../../_shared/reports.js";

// Cached fold — see _shared/reports.js. `?fresh=1` bypasses the cache and rebuilds it.
export async function onRequestGet(ctx) {
  const fresh = new URL(ctx.request.url).searchParams.get("fresh") === "1";
  try { return json(await (fresh ? foldReportsAndCache : foldReportsCached)(ctx.env.DB)); }
  catch (e) { return json({ error: `${e.name}: ${e.message}`, items: [] }, 500); }
}
