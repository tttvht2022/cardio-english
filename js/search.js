// Full-text search across the whole book (index built once, cached in IndexedDB)
import { idb } from './store.js';

let index = null, building = null;
export async function getIndex(viewer, onProgress) {
  if (index) return index;
  if (building) return building;
  building = (async () => {
    const n = viewer.doc.numPages;
    const cached = await idb.get('cache', 'textindex-v1');
    if (cached && cached.length === n) { index = cached; return index; }
    const out = new Array(n);
    for (let p = 1; p <= n; p++) {
      try { out[p - 1] = await viewer.pageText(p); } catch { out[p - 1] = ''; }
      if (p % 10 === 0) onProgress?.(p, n);
    }
    index = out; idb.set('cache', 'textindex-v1', out); onProgress?.(n, n);
    return index;
  })();
  try { return await building; } finally { building = null; }
}

export function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function search(idx, q, limit = 300) {
  q = q.trim(); if (q.length < 2) return [];
  const re = new RegExp(escapeRe(q).replace(/\s+/g, '\\s+'), 'gi');
  const res = [];
  for (let i = 0; i < idx.length && res.length < limit; i++) {
    const t = idx[i]; re.lastIndex = 0; let m, k = 0;
    while ((m = re.exec(t)) && k < 3) {
      const a = Math.max(0, m.index - 70), b = Math.min(t.length, m.index + m[0].length + 90);
      res.push({ page: i + 1, before: (a > 0 ? '…' : '') + t.slice(a, m.index), hit: m[0], after: t.slice(m.index + m[0].length, b) + (b < t.length ? '…' : '') });
      k++;
    }
  }
  return res;
}

export function countTerms(text, terms) {
  // terms: [{key, re}] → counts
  const out = [];
  for (const t of terms) { t.re.lastIndex = 0; const m = text.match(t.re); if (m) out.push({ ...t, n: m.length, sample: m[0] }); }
  return out.sort((a, b) => b.n - a.n);
}
