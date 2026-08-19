import { json, nowChicagoISO } from "../../_shared/attn.js";

const key = (ctx) => (ctx.params.path || []).join("/");

export async function onRequestGet(ctx) {
  const row = await ctx.env.DB.prepare("SELECT json FROM documents WHERE key = ?").bind(key(ctx)).first();
  if (!row) return json({ error: "not found" }, 404);
  return new Response(row.json, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

// Human-edited documents: D1 is canonical, edits come only from the UI (Access Google SSO).
// Machine writers (the Drive->D1 pool mirror, any script on a service token) must never touch
// these — 2026-08-19 the mirror twice clobbered the Priorities board with a stale Drive copy.
const HUMAN_EDITED = new Set(["tasks.json"]);

export async function onRequestPut(ctx) {
  const k = key(ctx);
  // The attention queue is generated output; whole-queue writes revert other people's decisions.
  if (k === "attention/queue.json")
    return json({ error: "attention/queue.json is generated output. POST /api/attention/decision instead." }, 409);
  const id = ctx.data.identity;
  if (HUMAN_EDITED.has(k) && !(id && id.kind === "human"))
    return json({ error: k + " is human-edited (D1-canonical). Machine/service writes are rejected so the Drive mirror can't clobber UI edits. Edit it in the Command Center UI." }, 403);
  const body = await ctx.request.text();
  try { JSON.parse(body); } catch (e) { return json({ error: "invalid JSON: " + e.message }, 400); }
  const who = id ? id.email : null;
  const now = nowChicagoISO();
  await ctx.env.DB.prepare(
    "INSERT INTO documents(key, json, updated_at, updated_by) VALUES(?, ?, ?, ?) " +
    "ON CONFLICT(key) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at, updated_by=excluded.updated_by"
  ).bind(k, body, now, who).run();
  // Every-version history for human-edited docs (Time Travel only reaches back 30 days).
  if (HUMAN_EDITED.has(k))
    await ctx.env.DB.prepare(
      "INSERT INTO documents_history(key, json, updated_at, updated_by) VALUES(?, ?, ?, ?)"
    ).bind(k, body, now, who).run().catch(() => {});
  return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
