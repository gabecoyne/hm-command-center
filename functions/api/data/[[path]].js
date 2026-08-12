import { json, nowChicagoISO } from "../../_shared/attn.js";

const key = (ctx) => (ctx.params.path || []).join("/");

export async function onRequestGet(ctx) {
  const row = await ctx.env.DB.prepare("SELECT json FROM documents WHERE key = ?").bind(key(ctx)).first();
  if (!row) return json({ error: "not found" }, 404);
  return new Response(row.json, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export async function onRequestPut(ctx) {
  const k = key(ctx);
  // The attention queue is generated output; whole-queue writes revert other people's decisions.
  if (k === "attention/queue.json")
    return json({ error: "attention/queue.json is generated output. POST /api/attention/decision instead." }, 409);
  const body = await ctx.request.text();
  try { JSON.parse(body); } catch (e) { return json({ error: "invalid JSON: " + e.message }, 400); }
  const who = ctx.data.identity ? ctx.data.identity.email : null;
  await ctx.env.DB.prepare(
    "INSERT INTO documents(key, json, updated_at, updated_by) VALUES(?, ?, ?, ?) " +
    "ON CONFLICT(key) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at, updated_by=excluded.updated_by"
  ).bind(k, body, nowChicagoISO(), who).run();
  return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
