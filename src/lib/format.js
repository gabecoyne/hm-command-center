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

/* Short, human "when" for queue rows — always America/Chicago (CLAUDE.md: never UTC).
   Time of day is the point: it is how you tell "filed an hour ago" from "filed at 2am by a
   scheduled run", and today/yesterday get named so the common case reads without arithmetic.
   Some producers write a naive timestamp with no offset ("2026-08-08T15:02:27.703365"). Those are
   already CT by convention, so they are read literally rather than re-zoned — converting them
   would shift a 3pm filing by the browser's offset. */
const _CT = { timeZone: 'America/Chicago' };
const _dayKey = t => new Intl.DateTimeFormat('en-CA', Object.assign({ year: 'numeric', month: '2-digit', day: '2-digit' }, _CT)).format(t);

export function whenCT(iso) {
  if (!iso) return '—';
  const raw = String(iso);
  const naive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !/(Z|[+-]\d{2}:?\d{2})$/.test(raw);
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;

  let dk, time;
  if (naive) {
    // read the wall-clock the producer wrote, verbatim
    dk = raw.slice(0, 10);
    let h = +raw.slice(11, 13); const mi = raw.slice(14, 16);
    const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12;
    time = h + ':' + mi + ' ' + ap;
  } else {
    dk = _dayKey(d);
    time = new Intl.DateTimeFormat('en-US', Object.assign({ hour: 'numeric', minute: '2-digit' }, _CT)).format(d);
  }

  const now = new Date();
  const today = _dayKey(now), yest = _dayKey(new Date(now.getTime() - 86400000));
  if (dk === today) return 'Today ' + time;
  if (dk === yest) return 'Yesterday ' + time;

  const [y, m, dd] = dk.split('-').map(Number);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yr = String(y) === today.slice(0, 4) ? '' : ' \u2019' + String(y).slice(2);
  return MON[m - 1] + ' ' + dd + yr + ', ' + time;
}
