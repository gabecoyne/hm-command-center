import { json, nowChicagoISO, actorFor } from "../../_shared/attn.js";
import { REPORT_RECORD_KINDS, insertReportRecord, foldReportsFromDB } from "../../_shared/reports.js";

// One human action on a report: `read` (acknowledge) or `comment` (a note the producing agent reads
// back on its next run). Accepts report_ids[] so marking a filtered page read is one write + one fold.
export async function onRequestPost(ctx) {
  let b;
  try { b = (await ctx.request.json()) || {}; } catch (e) { return json({ error: "invalid JSON" }, 400); }
  const ids = Array.isArray(b.report_ids) && b.report_ids.length ? b.report_ids : (b.report_id ? [b.report_id] : []);
  const kind = b.kind || "read";
  const by = actorFor(ctx, b.by);
  if (!ids.length || !by) return json({ error: "report_id (or report_ids) and by are required" }, 400);
  if (!REPORT_RECORD_KINDS.includes(kind)) return json({ error: `kind must be one of ${REPORT_RECORD_KINDS.join(", ")}` }, 400);
  const text = String(b.text || "").trim();
  if (kind === "comment" && !text) return json({ error: "a comment needs text" }, 400);
  const ts = nowChicagoISO();
  try {
    for (const report_id of ids) {
      const rec = { report_id, kind, by, ts };
      if (kind === "comment") { rec.text = text; rec.author_kind = b.author_kind === "agent" ? "agent" : "human"; }
      await insertReportRecord(ctx.env.DB, rec);
    }
    return json(await foldReportsFromDB(ctx.env.DB));
  } catch (e) { return json({ error: `${e.name}: ${e.message}` }, 400); }
}
