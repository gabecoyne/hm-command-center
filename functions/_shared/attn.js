// Fold logic ported 1:1 from Scripts/hm_attention.py so D1 produces byte-compatible queue state.
// The live queue is DERIVED: start from each item, apply its decision records oldest-first,
// derive `awaiting`, sort by generated_at. Nothing is stored folded.

export const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// ---- closed enums (mirror hm_attention.py) ----
export const OWNERS = ["gabe", "collin"];
export const SEATS = ["paid_media","brand","ecommerce","lifecycle","marketing_analyst","ops_analyst",
  "market_intel","inventory","customer_service","systems","finance","integrator",
  "business_intelligence","ea"];
export const TYPES = ["approval","failure","performance","risk"];
export const ALERT_TYPES = ["risk","failure","performance"];
export const SEVERITIES = ["urgent","high","normal"];
// "dismissed" (2026-08-17) is a HUMAN terminal state: cleared from the queue without recording
// an approve/reject or an acknowledgement. It exists so bulk-clearing 100+ stale items does not
// pollute the decision log with decisions nobody actually made — the log stays an honest record
// of what was decided, and dismissals stay visibly separate from it.
export const STATUSES = ["open","resolved","superseded","dismissed"];
export const DECISIONS = ["approved","rejected","changes_requested","answered"];
export const RECORD_KINDS = ["decision","ack","producer_ack","status"];
const REQUIRED = ["item_id","owner","seat","type","severity","title","link","source","generated_at"];
const APPROVAL_FIELDS = ["question","options","what_i_found","proposal","expected_outcome","detail",
  "decision","feedback","decided_by","decided_at","ack_at","ack_by"];
export const HUMAN_APPROVAL_FIELDS = ["decision","feedback","decided_by","decided_at","ack_at","ack_by"];
const TITLE_MAX_APPEND = 100, TITLE_MAX_FOLD = 160;

export class AttentionError extends Error { constructor(m){ super(m); this.name = "AttentionError"; } }

// Chicago ISO-8601 timestamp (house rule: never UTC in stored HM state).
export function nowChicagoISO(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  let hh = p.hour === "24" ? "00" : p.hour;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +hh, +p.minute, +p.second);
  const off = Math.round((asUTC - d.getTime()) / 60000);
  const sign = off >= 0 ? "+" : "-", ab = Math.abs(off);
  const oh = String(Math.floor(ab / 60)).padStart(2, "0"), om = String(ab % 60).padStart(2, "0");
  return `${p.year}-${p.month}-${p.day}T${hh}:${p.minute}:${p.second}${sign}${oh}:${om}`;
}

function historyRow(rec) {
  let action = rec.kind;
  if (action === "decision") action = rec.decision;
  else if (action === "ack") action = "acknowledged";
  else if (action === "status") action = rec.status === "dismissed" ? "dismissed" : (rec.status || "status");
  else if (action === "comment") action = rec.author_kind === "agent" ? "replied" : "commented";
  return { ts: rec.ts, by: rec.by || "?", action, note: rec.feedback || rec.text || "" };
}

function applyRecord(it, rec) {
  const kind = rec.kind, ts = rec.ts, by = rec.by || "?";
  if (kind === "ack") {
    it.ack_at = ts; it.ack_by = by; it.status = "resolved"; it.resolved_at = ts;
  } else if (kind === "decision") {
    const ap = it.approval || (it.approval = {});
    ap.decision = rec.decision; ap.feedback = rec.feedback || ""; ap.decided_by = by; ap.decided_at = ts;
  } else if (kind === "comment") {
    (it.thread || (it.thread = [])).push({ ts, by, author_kind: rec.author_kind || "human", text: rec.text || "" });
  } else if (kind === "producer_ack") {
    const ap = it.approval || (it.approval = {}); ap.ack_at = ts; ap.ack_by = by;
  } else if (kind === "status") {
    it.status = rec.status || it.status;
    if (it.status !== "open") it.resolved_at = ts;
    // A dismissal is attributable: who cleared it, when, and why. Without this the item just
    // vanishes and nobody can answer "who killed this?".
    if (it.status === "dismissed") { it.dismissed_at = ts; it.dismissed_by = by; it.dismiss_reason = rec.feedback || ""; }
  }
  (it.history || (it.history = [])).push(historyRow(rec));
  return it;
}

function deriveAwaiting(it) {
  const th = it.thread || [];
  if (!th.length) return null;
  return th[th.length - 1].author_kind === "human" ? "agent" : "human";
}

// items: array of parsed item objects; records: array of parsed records ORDERED oldest-first.
export function foldState(items, records) {
  const byItem = {};
  for (const r of records) (byItem[r.item_id] || (byItem[r.item_id] = [])).push(r);
  const out = [];
  for (const it0 of items) {
    const it = JSON.parse(JSON.stringify(it0));
    if (it.item_id == null) continue;
    if (!it.thread) it.thread = [];
    for (const r of (byItem[it.item_id] || [])) applyRecord(it, r);
    it.awaiting = deriveAwaiting(it);
    out.push(it);
  }
  out.sort((a, b) => String(a.generated_at || "").localeCompare(String(b.generated_at || "")));
  return { schema_version: 1, schema: "data/attention/schema.json", updated_at: nowChicagoISO(), items: out };
}

// ---- validate (ported essentials of hm_attention.validate + short-title enforcement) ----
function enforceShortTitle(item) {
  const title = item.title || "";
  if (title.length <= TITLE_MAX_APPEND) return item;
  let cut = title.slice(0, TITLE_MAX_APPEND).replace(/\s+\S*$/, "").replace(/[ ,;:—-]+$/, "") || title.slice(0, TITLE_MAX_APPEND);
  const short = cut + "…";
  if (item.type === "approval") {
    const ap = item.approval || (item.approval = {});
    ap.detail = title + (ap.detail ? "\n\n" + ap.detail : "");
  } else {
    item.detail = title + (item.detail ? "\n\n" + item.detail : "");
  }
  item.title = short;
  return item;
}

export function validateItem(item) {
  if (typeof item !== "object" || item === null) throw new AttentionError("item must be an object");
  enforceShortTitle(item);
  const missing = REQUIRED.filter((f) => !item[f]);
  if (missing.length) throw new AttentionError(`missing required field(s): ${missing.join(", ")}`);
  if (!OWNERS.includes(item.owner)) throw new AttentionError(`owner '${item.owner}' not allowed`);
  if (!SEATS.includes(item.seat)) throw new AttentionError(`seat '${item.seat}' not allowed`);
  if (!TYPES.includes(item.type)) throw new AttentionError(`type '${item.type}' not allowed`);
  if (!SEVERITIES.includes(item.severity)) throw new AttentionError(`severity '${item.severity}' not allowed`);
  const st = item.status || "open";
  if (!STATUSES.includes(st)) throw new AttentionError(`status '${st}' not allowed`);
  if (!(item.title.length >= 3 && item.title.length <= TITLE_MAX_FOLD)) throw new AttentionError(`title must be 3..${TITLE_MAX_FOLD} chars`);
  const ap = item.approval;
  if (item.type === "approval") {
    if (typeof ap !== "object" || ap === null) throw new AttentionError("type 'approval' requires an `approval` object");
    if (!(ap.proposal || ap.question)) throw new AttentionError("approval.proposal or approval.question is required");
    const bad = Object.keys(ap).filter((k) => !APPROVAL_FIELDS.includes(k));
    if (bad.length) throw new AttentionError(`unknown approval field(s): ${bad.sort().join(", ")}`);
    if (ap.decision && !DECISIONS.includes(ap.decision)) throw new AttentionError(`approval.decision '${ap.decision}' not allowed`);
    if (ap.options != null && !Array.isArray(ap.options)) throw new AttentionError("approval.options must be a list");
    for (const k of APPROVAL_FIELDS) if (!(k in ap)) ap[k] = k === "options" ? [] : null;
  } else {
    if (ap) throw new AttentionError(`type '${item.type}' is an alert and must not carry an \`approval\` payload`);
    item.approval = null;
  }
  if (item.status == null) item.status = "open";
  if (item.resolved_at === undefined) item.resolved_at = null;
  if (item.resolves_by === undefined) item.resolves_by = null;
  if (item.dedup_key === undefined) item.dedup_key = null;
  if (item.detail === undefined) item.detail = null;
  if (!item.thread) item.thread = [];
  return item;
}

// ---- D1 helpers ----
export async function insertRecord(DB, rec) {
  await DB.prepare("INSERT INTO attention_decisions(item_id, ts, record_json) VALUES(?, ?, ?)")
    .bind(rec.item_id, rec.ts, JSON.stringify(rec)).run();
}
export async function foldFromDB(DB) {
  const items = (await DB.prepare("SELECT item_json FROM attention_items").all()).results.map((r) => JSON.parse(r.item_json));
  const recs = (await DB.prepare("SELECT record_json FROM attention_decisions ORDER BY ts, id").all()).results.map((r) => JSON.parse(r.record_json));
  return foldState(items, recs);
}
