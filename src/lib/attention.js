// Live/alert semantics MIRROR Scripts/hm_attention.py is_alert()/is_live() exactly. Do not diverge.
const ALERT_TYPES = ['risk', 'failure', 'performance'];
export const isAlert = i => ALERT_TYPES.includes(i && i.type);
export const isLive = i => {
  if (!i) return false;
  if ((i.status || 'open') !== 'open') return false;
  return isAlert(i) ? !i.ack_at : !((i.approval || {}).decision);
};
export const liveItems = items => (items || []).filter(isLive);
