import { json, validateItem, foldFromDB, nowChicagoISO, HUMAN_APPROVAL_FIELDS } from "../../_shared/attn.js";
export async function onRequestPost(ctx) {
  let body;
  try { body = await ctx.request.json(); } catch (e) { return json({ error: "invalid JSON" }, 400); }
  try {
    const item = validateItem(body || {});
    // Producers own the finding, never the human decision — decisions live in records, folded on read.
    if (item.approval) for (const k of HUMAN_APPROVAL_FIELDS) delete item.approval[k];
    delete item.history; delete item.ack_at; delete item.ack_by;
    await ctx.env.DB.prepare(
      "INSERT INTO attention_items(item_id, owner, generated_at, item_json, updated_at) VALUES(?, ?, ?, ?, ?) " +
      "ON CONFLICT(item_id) DO UPDATE SET owner=excluded.owner, generated_at=excluded.generated_at, item_json=excluded.item_json, updated_at=excluded.updated_at"
    ).bind(item.item_id, item.owner, item.generated_at, JSON.stringify(item), nowChicagoISO()).run();
    return json(await foldFromDB(ctx.env.DB));
  } catch (e) { return json({ error: `${e.name}: ${e.message}` }, 400); }
}
