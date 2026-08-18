// Data layer: read/write the Command Center JSON API (server.py). Ported from
// the monolith's api/aGet/aPut/aHealth + load(), now writing into the store.
import { setState, getState } from './state.js';

const CONFIG = { apiBase: '', pollMs: 30000 };
const api = p => (CONFIG.apiBase || '') + '/api/data/' + p;

export const aGet = async p => {
  const r = await fetch(api(p), { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
};
export const aPut = async (p, d) => {
  const r = await fetch(api(p), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
};
export const normalizePerson = e => {
  const v = String(e || '').trim().toLowerCase();
  if (v === 'gabe' || v.startsWith('gabe@')) return 'gabe';
  if (v === 'collin' || v.startsWith('collin@')) return 'collin';
  return null;
};
/* Returns {ok, identity} — /api/health echoes back the Cloudflare Access identity the middleware
   verified, which is how the app knows whether it's Gabe or Collin without asking. */
export const aHealth = async () => {
  try {
    const r = await fetch((CONFIG.apiBase || '') + '/api/health');
    if (!r.ok) return { ok: false, identity: null };
    const j = await r.json().catch(() => ({}));
    return { ok: true, identity: (j && j.identity) || null };
  } catch { return { ok: false, identity: null }; }
};

export async function load() {
  const [attn, roster, elog, tasks, dash, inv, reports, analysis, life, sched, model, cash, calib, runs, cro, price] = await Promise.all([
    fetch((CONFIG.apiBase || '') + '/api/attention/state').then(r => r.json())
      .catch(() => aGet('attention/queue.json').catch(() => ({ items: [] }))),
    aGet('ecomm_state.json').catch(() => ({ agents: [], schedules: {} })),
    aGet('event_log.json').catch(() => ({ items: [] })),
    aGet('tasks.json').catch(() => ({ tasks: [], columns: ['backlog', 'scheduled', 'in_progress', 'done'] })),
    aGet('dashboard.json').catch(() => null),
    aGet('inventory.json').catch(() => null),
    aGet('reports.json').catch(() => ({ items: [] })),
    aGet('analysis.json').catch(() => ({ items: {} })),
    aGet('lifecycle.json').catch(() => null),
    aGet('schedule.json').catch(() => null),
    aGet('model.json').catch(() => null),
    aGet('cash.json').catch(() => null),
    aGet('calibration.json').catch(() => ({ totals: {}, seats: [] })),
    aGet('runs.json').catch(() => ({ items: [] })),
    aGet('cro_snapshot.json').catch(() => null),
    // Price tests ride on the CRO page but have their own feeder
    // (build_price_snapshot.py); one being stale must not blank the other.
    aGet('price_snapshot.json').catch(() => null),
  ]);
  let roadmap = getState().roadmap;
  try { roadmap = await aGet('roadmap.json'); } catch {}
  setState({ attn, roster, elog, tasks, dash, inv, reports, analysis, life, sched, model, cash, calib, runs, cro, price, roadmap, loading: false });
}

/* The attention queue is append-only: one file per item, one file per decision, and a generated
   snapshot. The client never sends the whole queue, because a window holding an older snapshot
   would revert every decision made since it loaded (2026-08-10). It POSTs ONE record and takes
   the freshly folded state back. See Doc/Engineering/HM_Shared_State_Architecture.md. */
const aPost = async (path, body) => {
  const r = await fetch((CONFIG.apiBase || '') + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let out = null; try { out = await r.json(); } catch {}
  if (!r.ok) throw new Error((out && out.error) || 'HTTP ' + r.status);
  return out;
};

// Record one decision / acknowledgement. Returns the folded queue, which includes anything the
// other machine decided while this window was open.
export async function postDecision(rec) {
  const attn = await aPost('/api/attention/decision', rec);
  setState({ attn });
  return attn;
}

// Record the SAME response across many items in one round trip (bulk acknowledge / dismiss).
// One record per item is still written server-side; only the fold is shared, which is what makes
// clearing a large backlog fast enough that people actually do it.
export async function postBulkDecision(rec) {
  const attn = await aPost('/api/attention/decision', rec);
  setState({ attn });
  return attn;
}

// File one new item (e.g. a note from the Reports drawer).
export async function postItem(item) {
  const attn = await aPost('/api/attention/item', item);
  setState({ attn });
  return attn;
}

// Post one human reply into an item's conversation. Keeps the item live and flips it to
// awaiting=agent — the producing agent answers on its next run (Attention_Item_Contract.md §6).
// Works on alerts and approvals alike. Returns the freshly folded queue.
export async function postComment(rec) {
  const attn = await aPost('/api/attention/comment', rec);
  setState({ attn });
  return attn;
}

// Refold from the server (used after a write conflict or on demand).
export async function refreshAttention() {
  const r = await fetch((CONFIG.apiBase || '') + '/api/attention/state');
  if (!r.ok) return null;
  const attn = await r.json();
  setState({ attn });
  return attn;
}

// Write helper for the task board.
export async function putTasks(tasksObj) {
  const res = await aPut('tasks.json', tasksObj);
  setState({ tasks: res });
  return res;
}

export async function boot() {
  const { ok, identity } = await aHealth();
  const patch = { connected: ok };
  /* A verified human identity is authoritative — it decides whose queue you land on and whose name
     goes on your decisions. Service tokens and local dev (no Access in front) leave it null and the
     manual switcher stays in charge. */
  if (identity && identity.kind === 'human') {
    const who = normalizePerson(identity.email);
    patch.identity = { ...identity, person: who };
    if (who) { patch.user = who; try { localStorage.setItem('hm_user', who); } catch {} }
  }
  setState(patch);
  try { await load(); } catch { setState({ loading: false }); }
  return setInterval(() => load().catch(() => {}), CONFIG.pollMs);
}
