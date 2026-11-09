// Local persistence: localStorage (small JSON) + IndexedDB (PDF blob, AI cache)
const NS = 'cardioeng:';
export const ls = {
  get(k, d) { try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { console.warn('localStorage', e); } },
  del(k) { try { localStorage.removeItem(NS + k); } catch {} },
  dump() { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(NS) && !k.startsWith(NS + 'aic:')) o[k.slice(NS.length)] = localStorage.getItem(k); } } catch {} return o; },
  load(o) { for (const [k, v] of Object.entries(o)) try { localStorage.setItem(NS + k, v); } catch {} }
};

let dbp;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('cardioeng', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('files'); d.createObjectStore('cache'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(store, mode); const s = t.objectStore(store); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); });
}
export const idb = {
  get: (store, k) => tx(store, 'readonly', s => s.get(k)).catch(() => undefined),
  set: (store, k, v) => tx(store, 'readwrite', s => s.put(v, k)).catch(e => console.warn('idb', e)),
  del: (store, k) => tx(store, 'readwrite', s => s.delete(k)).catch(() => {}),
  clear: (store) => tx(store, 'readwrite', s => s.clear()).catch(() => {}),
};

export async function hash(str) {
  const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
