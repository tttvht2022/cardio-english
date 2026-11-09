// Daily activity log, streak and goals
import { ls } from './store.js';

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function logActivity(kind, n = 1) {
  const a = ls.get('activity', {}); const k = today();
  a[k] = a[k] || {}; a[k][kind] = (a[k][kind] || 0) + n;
  ls.set('activity', a);
}
export function dayTotal(d) { return Object.values(d || {}).reduce((s, v) => s + v, 0); }
export function streak() {
  const a = ls.get('activity', {}); let s = 0; const d = new Date();
  if (!dayTotal(a[today(d)])) d.setDate(d.getDate() - 1); // today not started yet: count from yesterday
  while (dayTotal(a[today(d)]) > 0) { s++; d.setDate(d.getDate() - 1); }
  return s;
}
export const GOALS = { words: 10, cards: 20, cases: 1, speak: 5 };
export function goals() { return { ...GOALS, ...ls.get('goals', {}) }; }
