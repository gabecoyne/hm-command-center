// Fold logic for the Reports shelf, mirroring _shared/attn.js.
//
// `reports.json` is a documents blob the dispatcher rewrites from Drive on every tick. Anything a
// human puts INSIDE that blob — read state, a note — is gone on the next sync. So human actions are
// append-only records in their own table and folded onto the reports at read time, exactly like the
// attention queue. Nothing is stored folded.
import { json, nowChicagoISO, normalizePerson } from "./attn.js";

export const REPORT_RECORD_KINDS = ["read", "comment"];

function applyRecord(r, rec) {
  if (rec.kind === "read") {
    // first read wins — "who saw this first" is the useful fact, not who looked most recently
    if (!r.read) { r.read = true; r.read_by = rec.by; r.read_at = rec.ts; }
  } else if (rec.kind === "comment") {
    (r.thread || (r.thread = [])).push({
      ts: rec.ts, by: rec.by, author_kind: rec.author_kind || "human", text: rec.text || "",
    });
  }
  return r;
}

// Whose turn it is. A human comment leaves the agent owing an answer on its next run; the agent
// replying hands it back. This is what lets a producer query "which of my reports have unanswered
// comments" without any extra bookkeeping.
function deriveAwaiting(r) {
  const th = r.thread || [];
  if (!th.length) return null;
  return th[th.length - 1].author_kind === "human" ? "agent" : "human";
}

export function foldReports(doc, records) {
  const items = ((doc && doc.items) || []).map((x) => JSON.parse(JSON.stringify(x)));
  const byId = {};
  for (const rec of records) (byId[rec.report_id] || (byId[rec.report_id] = [])).push(rec);
  for (const r of items) {
    if (!r.thread) r.thread = [];
    for (const rec of byId[r.id] || []) applyRecord(r, rec);
    r.awaiting = deriveAwaiting(r);
  }
  return { updated: (doc && doc.updated) || null, updated_at: nowChicagoISO(), items };
}

export async function foldReportsFromDB(DB) {
  const row = await DB.prepare("SELECT json FROM documents WHERE key = ?").bind("reports.json").first();
  let doc = { items: [] };
  if (row) { try { doc = JSON.parse(row.json); } catch (_) {} }
  const recs = (await DB.prepare("SELECT record_json FROM report_records ORDER BY ts, id").all())
    .results.map((r) => JSON.parse(r.record_json));
  return foldReports(doc, recs);
}

export async function insertReportRecord(DB, rec) {
  await DB.prepare("INSERT INTO report_records(report_id, ts, record_json) VALUES(?, ?, ?)")
    .bind(rec.report_id, rec.ts, JSON.stringify(rec)).run();
}

export { json, nowChicagoISO, normalizePerson };
