import { json, insertRecord, foldFromDB, nowChicagoISO, RECORD_KINDS } from "../../_shared/attn.js";
export async function onRequestPost(ctx) {
  let b;
  try { b = (await ctx.request.json()) || {}; } catch (e) { return json({ error: "invalid JSON" }, 400); }
  const item_id = b.item_id;
  const by = b.by || (ctx.data.identity ? ctx.data.identity.email : null);
  const kind = b.kind || "decision";
  if (!item_id || !by) return json({ error: "item_id and by are required" }, 400);
  if (!RECORD_KINDS.includes(kind)) return json({ error: `kind must be one of ${RECORD_KINDS.join(", ")}` }, 400);
  const rec = { item_id, kind, by, ts: nowChicagoISO() };
  if (b.decision) rec.decision = b.decision;
  if (b.feedback) rec.feedback = b.feedback;
  if (b.status) rec.status = b.status;
  try { await insertRecord(ctx.env.DB, rec); return json(await foldFromDB(ctx.env.DB)); }
  catch (e) { return json({ error: `${e.name}: ${e.message}` }, 400); }
}
