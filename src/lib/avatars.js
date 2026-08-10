// Agent sigils + user avatars. These return raw HTML strings; render via
// dangerouslySetInnerHTML in components (ported verbatim from the monolith).
import { esc } from './format.js';

const EMB = {
  athena: '<circle cx="12" cy="11.5" r="6.3"/><path d="M7.2 5.6 L9.6 8.2"/><path d="M16.8 5.6 L14.4 8.2"/><circle cx="9.7" cy="11" r="1.5" fill="currentColor" stroke="none"/><circle cx="14.3" cy="11" r="1.5" fill="currentColor" stroke="none"/><path d="M10.8 13.4 L12 14.6 L13.2 13.4"/>',
  demeter: '<path d="M12 21 V6.5"/><path d="M12 8.4 C10.2 8.4 9.2 7 9.2 5.4 C10.8 5.4 12 6.6 12 8.4Z" fill="currentColor" stroke="none"/><path d="M12 8.4 C13.8 8.4 14.8 7 14.8 5.4 C13.2 5.4 12 6.6 12 8.4Z" fill="currentColor" stroke="none"/><path d="M12 12.6 C10.2 12.6 9.2 11.2 9.2 9.6 C10.8 9.6 12 10.8 12 12.6Z" fill="currentColor" stroke="none"/><path d="M12 12.6 C13.8 12.6 14.8 11.2 14.8 9.6 C13.2 9.6 12 10.8 12 12.6Z" fill="currentColor" stroke="none"/><path d="M12 16.8 C10.2 16.8 9.2 15.4 9.2 13.8 C10.8 13.8 12 15 12 16.8Z" fill="currentColor" stroke="none"/><path d="M12 16.8 C13.8 16.8 14.8 15.4 14.8 13.8 C13.2 13.8 12 15 12 16.8Z" fill="currentColor" stroke="none"/>',
  hestia: '<path d="M12 3.5 C12 7.5 8.2 8.6 8.2 13 A3.8 3.8 0 0 0 15.8 13 C15.8 9.6 13.2 8.6 13.2 5.4 C12.6 6.4 12 6.2 12 3.5Z"/>',
  hermes: '<line x1="12" y1="6.5" x2="12" y2="21"/><circle cx="12" cy="5" r="1.5"/><path d="M12 8.4 C9.4 7.2 7.4 5.4 7.4 5.4 C9.4 5.4 11 6.4 12 8.4Z" fill="currentColor" stroke="none"/><path d="M12 8.4 C14.6 7.2 16.6 5.4 16.6 5.4 C14.6 5.4 13 6.4 12 8.4Z" fill="currentColor" stroke="none"/><path d="M9 11.5 C10.6 13 13.4 13 15 11.5"/><path d="M9 15.5 C10.6 17 13.4 17 15 15.5"/>',
  hera: '<path d="M12 21 V6"/><ellipse cx="12" cy="7" rx="4.4" ry="5.8"/><circle cx="12" cy="7" r="2.4"/><circle cx="12" cy="7" r="0.9" fill="currentColor" stroke="none"/>',
  metis: '<path d="M10 3.2 H14"/><path d="M11 3.2 V8.8 L6.7 17.6 A2 2 0 0 0 8.5 20.6 H15.5 A2 2 0 0 0 17.3 17.6 L13 8.8 V3.2"/><path d="M8.9 14.6 H15.1"/>',
  nike: '<path d="M4 8.4 C10 8.4 15.5 10.6 20 15.4"/><path d="M6.4 8.6 C6.4 10.6 7.4 11.6 9.4 11.8"/><path d="M9.6 9.6 C9.6 11.5 10.7 12.6 12.7 12.9"/><path d="M12.8 11 C12.8 13 14 14 16 14.4"/>',
  apollo: '<path d="M8 6.2 C6 8.4 6 14 8 20"/><path d="M16 6.2 C18 8.4 18 14 16 20"/><path d="M8 6.2 C10.4 5.2 13.6 5.2 16 6.2"/><line x1="10" y1="8.4" x2="10" y2="18.4"/><line x1="12" y1="8.2" x2="12" y2="18.6"/><line x1="14" y1="8.4" x2="14" y2="18.4"/>',
  iris: '<path d="M3.5 18 A8.5 8.5 0 0 1 20.5 18"/><path d="M6.8 18 A5.2 5.2 0 0 1 17.2 18"/><path d="M10 18 A2 2 0 0 1 14 18"/>',
  argus: '<path d="M2.8 12 C6 6.8 18 6.8 21.2 12 C18 17.2 6 17.2 2.8 12Z"/><circle cx="12" cy="12" r="2.7"/><circle cx="12" cy="12" r="0.95" fill="currentColor" stroke="none"/>',
  prometheus: '<path d="M12 3.6 C12.6 6.6 15 7.6 15 10 A3 3 0 0 1 9 10 C9 8.4 10.2 8 10.6 6.2 C11.2 7.4 12 7 12 3.6Z"/><line x1="12" y1="13.2" x2="12" y2="20.4"/><path d="M9.4 20.4 H14.6"/>',
  ganymede: '<path d="M6.8 4 H17.2"/><path d="M8 4 C8 9.4 10 11.4 12 11.4 C14 11.4 16 9.4 16 4"/><line x1="12" y1="11.4" x2="12" y2="18.4"/><path d="M8.8 18.6 H15.2"/>',
};
const TONE = { clay: ['#B2663F', '#FBF8F2'], olive: ['#5E6B52', '#FBF8F2'], blue: ['#7E93A0', '#FBF8F2'], char: ['#3A3D3C', '#D9B493'], ink: ['#1F2421', '#D9B493'] };
const AGENT_PERSONA = { 'head-of-ecomm': { key: 'hermes', tone: 'clay' }, 'paid-media': { key: 'nike', tone: 'clay' }, 'merchandising-feed': { key: 'argus', tone: 'char' }, 'cro': { key: 'metis', tone: 'clay' }, 'seo': { key: 'prometheus', tone: 'char' }, 'aeo': { key: 'hera', tone: 'olive' }, 'organic-social': { key: 'apollo', tone: 'clay' }, 'lifecycle-email': { key: 'iris', tone: 'clay' }, 'trybe-manager': { key: 'ganymede', tone: 'ink' }, 'athena-finance': { key: 'athena', tone: 'blue' }, 'hestia-cs': { key: 'hestia', tone: 'olive' }, 'demeter-inventory': { key: 'demeter', tone: 'olive' } };

export { EMB, TONE, AGENT_PERSONA };

export function avatarSigil(id, px) {
  const s = px || 22; const m = AGENT_PERSONA[id];
  if (m && EMB[m.key]) {
    const t = TONE[m.tone] || TONE.clay;
    return '<span class="inline-block shrink-0 align-middle" style="width:' + s + 'px;height:' + s + 'px" title="' + esc(m.key) + '"><svg viewBox="0 0 40 40" width="100%" height="100%" role="img" aria-label="' + esc(m.key) + '"><circle cx="20" cy="20" r="19" fill="' + t[0] + '"/><g transform="translate(8,8)" stroke="' + t[1] + '" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">' + EMB[m.key] + '</g></svg></span>';
  }
  const t = TONE.char;
  return '<span class="inline-grid place-items-center rounded-full shrink-0 align-middle" style="width:' + s + 'px;height:' + s + 'px;background:' + t[0] + ';color:' + t[1] + ';font:600 ' + Math.round(s * 0.46) + 'px ui-monospace,monospace">' + esc((id || '?').slice(0, 1).toUpperCase()) + '</span>';
}

export const userAv = (u, px) => '<img src="assets/' + esc(u) + '.jpg" alt="' + esc(u) + '" class="rounded-full object-cover inline-block border border-edge align-middle" style="width:' + (px || 20) + 'px;height:' + (px || 20) + 'px">';

export function forAvatars(list, px) {
  if (!list || !list.length) return '';
  return '<span class="inline-flex -space-x-1.5" title="for ' + esc(list.join(' & ')) + '">' + list.map(u => userAv(u, px || 20)).join('') + '</span>';
}
