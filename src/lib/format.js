// Formatting + small pure helpers ported verbatim from the monolith.
import { marked } from 'marked';

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const usd = n => '$' + Math.round(n || 0).toLocaleString();
export const fmtpct = n => (n == null || isNaN(+n)) ? '—' : (+n).toFixed(1) + '%';
export const cap = s => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '';
export const mdToHtml = s => marked.parse(String(s == null ? '' : s));

// ISO-8601 with the America/Chicago offset. CLAUDE.md: never UTC.
export function nowCT() {
  const d = new Date(); const q = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).forEach(x => q[x.type] = x.value);
  const asUTC = Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute, +q.second);
  const off = Math.round((asUTC - d.getTime()) / 60000);
  const sg = off < 0 ? '-' : '+', ao = Math.abs(off), hh = String(Math.floor(ao / 60)).padStart(2, '0'), mm = String(ao % 60).padStart(2, '0');
  return `${q.year}-${q.month}-${q.day}T${q.hour}:${q.minute}:${q.second}${sg}${hh}:${mm}`;
}

export function schWhen(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
}
