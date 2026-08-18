import { json, insertRecord, foldFromDB, nowChicagoISO, actorFor } from "../../_shared/attn.js";
export async function onRequestPost(ctx) {
  let b;
  try { b = (await ctx.request.json()) || {}; } catch (e) { return json({ error: "invalid JSON" }, 400); }
  const item_id = b.item_id;
  const by = actorFor(ctx, b.by);
  const text = (b.text || "").trim();
  const author_kind = b.author_kind || "human";
  if (!item_id || !by) return json({ error: "item_id and by are required" }, 400);
  if (!text) return json({ error: "comment text is required" }, 400);
  if (!["human", "agent"].includes(author_kind)) return json({ error: "author_kind must be human|agent" }, 400);
  const rec = { item_id, kind: "comment", by, ts: nowChicagoISO(), text, author_kind };
  try { await insertRecord(ctx.env.DB, rec); return json(await foldFromDB(ctx.env.DB)); }
  catch (e) { return json({ error: `${e.name}: ${e.message}` }, 400); }
}
