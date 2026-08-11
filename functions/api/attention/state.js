import { json, foldFromDB } from "../../_shared/attn.js";
export async function onRequestGet(ctx) {
  try { return json(await foldFromDB(ctx.env.DB)); }
  catch (e) { return json({ error: `fold unavailable: ${e.name}: ${e.message}` }, 503); }
}
