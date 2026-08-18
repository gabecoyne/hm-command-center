import { json, insertRecord, foldFromDB, nowChicagoISO, RECORD_KINDS, STATUSES, actorFor } from "../../_shared/attn.js";

// Records ONE human response, or — when `item_ids` is supplied — the same response across many
// items in a single round trip. Bulk matters: clearing a 100-item backlog one POST at a time
// means 100 sequential folds of the entire queue, which is slow enough that people stop clearing
// the queue at all. The write is still one record per item; only the fold is shared.
export async function onRequestPost(ctx) {
  let b;
  try { b = (await ctx.request.json()) || {}; } catch (e) { return json({ error: "invalid JSON" }, 400); }
  const ids = Array.isArray(b.item_ids) && b.item_ids.length ? b.item_ids : (b.item_id ? [b.item_id] : []);
  const by = actorFor(ctx, b.by);
  const kind = b.kind || "decision";
  if (!ids.length || !by) return json({ error: "item_id (or item_ids) and by are required" }, 400);
  if (!RECORD_KINDS.includes(kind)) return json({ error: `kind must be one of ${RECORD_KINDS.join(", ")}` }, 400);
  if (kind === "status" && b.status && !STATUSES.includes(b.status)) {
    return json({ error: `status must be one of ${STATUSES.join(", ")}` }, 400);
  }
  const ts = nowChicagoISO();
  try {
    for (const item_id of ids) {
      const rec = { item_id, kind, by, ts };
      if (b.decision) rec.decision = b.decision;
      if (b.feedback) rec.feedback = b.feedback;
      if (b.status) rec.status = b.status;
      await insertRecord(ctx.env.DB, rec);
    }
    return json(await foldFromDB(ctx.env.DB));
  } catch (e) { return json({ error: `${e.name}: ${e.message}` }, 400); }
}
