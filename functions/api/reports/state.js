import { json } from "../../_shared/attn.js";
import { foldReportsFromDB } from "../../_shared/reports.js";
export async function onRequestGet(ctx) {
  try { return json(await foldReportsFromDB(ctx.env.DB)); }
  catch (e) { return json({ error: `${e.name}: ${e.message}`, items: [] }, 500); }
}
