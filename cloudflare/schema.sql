-- Host Modern Command Center — D1 schema.
-- Two concerns, faithful to the current architecture:
--   1) documents  : the blob feeds collectors/agents produce (ecomm_state.json, event_log.json,
--                    dashboard.json, schedule.json, tasks.json, ...). Mirrors GET/PUT /api/data/<key>.
--   2) attention_* : the append-only queue ported from hm_attention.py. One row per item
--                    (owned/upserted by the producing agent) + one immutable record per
--                    decision/ack/comment/producer_ack/status. The live queue is FOLDED on read,
--                    never stored — same semantics as fold_state(), now a SQL read instead of a
--                    directory of files. No two writers ever touch the same row, so nothing clobbers.

CREATE TABLE IF NOT EXISTS documents (
  key         TEXT PRIMARY KEY,
  json        TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS attention_items (
  item_id       TEXT PRIMARY KEY,
  owner         TEXT,
  generated_at  TEXT,
  item_json     TEXT NOT NULL,   -- the full item object, exactly as the producer filed it
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attention_decisions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id      TEXT NOT NULL,
  ts           TEXT NOT NULL,     -- Chicago ISO-8601; fold applies records oldest-first
  record_json  TEXT NOT NULL      -- {item_id, kind, by, ts, decision?, feedback?, status?, text?, author_kind?}
);
CREATE INDEX IF NOT EXISTS idx_dec_item ON attention_decisions(item_id, ts, id);

-- 3) report_records : the human side of the Reports shelf, append-only for the same reason the
--    attention queue is. `reports.json` is a `documents` blob that the dispatcher REWRITES from
--    Drive every tick, so read-state and comments stored inside it were erased on the next sync
--    (which is why "mark read" never stuck). Records live outside the blob and are folded on read.
CREATE TABLE IF NOT EXISTS report_records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id    TEXT NOT NULL,
  ts           TEXT NOT NULL,     -- Chicago ISO-8601; fold applies records oldest-first
  record_json  TEXT NOT NULL      -- {report_id, kind: read|comment, by, ts, text?, author_kind?}
);
CREATE INDEX IF NOT EXISTS idx_rep_rec ON report_records(report_id, ts, id);
