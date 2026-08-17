// Live/alert semantics MIRROR Scripts/hm_attention.py is_alert()/is_live() exactly. Do not diverge.
const ALERT_TYPES = ['risk', 'failure', 'performance'];
export const isAlert = i => ALERT_TYPES.includes(i && i.type);
export const isLive = i => {
  if (!i) return false;
  // status !== open already covers resolved / superseded / dismissed — a dismissed item leaves
  // the queue by the same door every other closed item uses.
  if ((i.status || 'open') !== 'open') return false;
  return isAlert(i) ? !i.ack_at : !((i.approval || {}).decision);
};
export const isDismissed = i => !!i && (i.status || 'open') === 'dismissed';
export const liveItems = items => (items || []).filter(isLive);
