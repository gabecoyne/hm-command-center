// Context-rich chat prompt builders, ported from the monolith (dsnap/mkAsk).
import { getState } from '../state.js';

export const dsnap = () => {
  const d = getState().dash;
  return (d && d.updated) ? String(d.updated).slice(0, 16).replace('T', ' ') : 'live';
};

export const mkAsk = (subject, ctx) =>
  'Let’s dig into Host Modern’s ' + subject + '.\n\n' + ctx +
  '\n\n(From the Command Center, ' + dsnap() + ' snapshot.) What’s driving this and what should Gabe & Collin do next?';
