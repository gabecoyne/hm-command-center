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
export const aHealth = async () => { try { return (await fetch((CONFIG.apiBase || '') + '/api/health')).ok; } catch { return false; } };

export async function load() {
  const [attn, roster, elog, tasks, dash, inv, reports, analysis, life, sched, model, cash] = await Promise.all([
    aGet('attention/queue.json').catch(() => ({ items: [] })),
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
  ]);
  let roadmap = getState().roadmap;
  try { roadmap = await aGet('roadmap.json'); } catch {}
  setState({ attn, roster, elog, tasks, dash, inv, reports, analysis, life, sched, model, cash, roadmap, loading: false });
}

// Write helper for the attention queue (used by Reports note-filing, etc.).
export async function putQueue(items, updated) {
  const q = { ...(getState().attn || {}), items, updated: updated || new Date().toISOString() };
  const res = await aPut('attention/queue.json', q);
  setState({ attn: res });
  return res;
}

// Write helper for the task board.
export async function putTasks(tasksObj) {
  const res = await aPut('tasks.json', tasksObj);
  setState({ tasks: res });
  return res;
}

export async function boot() {
  const ok = await aHealth();
  setState({ connected: ok });
  try { await load(); } catch { setState({ loading: false }); }
  return setInterval(() => load().catch(() => {}), CONFIG.pollMs);
}
