// Tiny external store + a Preact hook. Replaces the monolith's module-level
// mutable globals. Any component calling useStore() re-renders on setState().
import { useState, useEffect } from 'preact/hooks';

const state = {
  attn: { items: [] },
  roster: { agents: [], schedules: {} },   // was `state` (ecomm_state.json) in the monolith
  elog: { items: [] },
  tasks: { tasks: [], columns: ['backlog', 'scheduled', 'in_progress', 'done'] },
  dash: null, inv: null,
  reports: { items: [] },
  analysis: { items: {} },
  life: null, sched: null, model: null, cash: null,
  roadmap: { products: [] },
  connected: false,
  loading: true,
  user: (() => { try { return localStorage.getItem('hm_user') || 'gabe'; } catch { return 'gabe'; } })(),
};

const listeners = new Set();
export function getState() { return state; }
export function setState(patch) { Object.assign(state, patch); listeners.forEach(l => l()); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function useStore() {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force(n => n + 1)), []);
  return state;
}

export function setUser(u) { try { localStorage.setItem('hm_user', u); } catch {} setState({ user: u }); }
export const currentUser = () => state.user;
