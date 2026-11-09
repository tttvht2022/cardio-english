// Client side of the AI gateway: cache, queue, retries, status.
import { ls, idb, hash } from './store.js';

let status = { checked: false, ok: false, providers: [], needsCode: false };
export function aiStatus() { return status; }

export async function checkAI() {
  try {
    const r = await fetch('/api/ai', { method: 'GET' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    status = { checked: true, ok: !!j.ok, providers: j.providers || [], needsCode: !!j.needsCode };
  } catch {
    status = { checked: true, ok: false, providers: [], needsCode: false, offline: true };
  }
  return status;
}

// simple concurrency limiter (2 at a time) so bursts don't trigger rate limits
let active = 0; const waiting = [];
async function slot() { if (active < 2) { active++; return; } await new Promise(r => waiting.push(r)); active++; }
function release() { active--; const n = waiting.shift(); if (n) n(); }

export class AIError extends Error { constructor(msg, kind) { super(msg); this.kind = kind; } }

export async function ai(task, payload, { cache = true } = {}) {
  const key = cache ? 'ai:' + await hash(task + '|' + JSON.stringify(payload)) : null;
  if (key) { const hit = await idb.get('cache', key); if (hit) return { ...hit, cached: true }; }
  if (status.checked && !status.ok) throw new AIError(status.offline ? 'Không kết nối được máy chủ AI (đang chạy file tĩnh?).' : 'AI chưa được cấu hình (thêm API key trên Vercel).', 'config');

  await slot();
  try {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-access-code': ls.get('accessCode', '') },
          body: JSON.stringify({ task, payload })
        });
        const j = await r.json().catch(() => ({}));
        if (r.status === 401) throw new AIError(j.error || 'Sai mã truy cập', 'auth');
        if (r.status === 503 && j.noProvider) throw new AIError(j.error, 'config');
        if (!r.ok) { lastErr = new AIError(j.error || ('Lỗi ' + r.status), 'server'); await new Promise(s => setTimeout(s, 1200 * (attempt + 1))); continue; }
        if (key) idb.set('cache', key, j);
        return j;
      } catch (e) {
        if (e instanceof AIError && (e.kind === 'auth' || e.kind === 'config')) throw e;
        lastErr = e; await new Promise(s => setTimeout(s, 1200 * (attempt + 1)));
      }
    }
    throw lastErr instanceof AIError ? lastErr : new AIError('Mất kết nối mạng, thử lại.', 'network');
  } finally { release(); }
}

// minimal, safe markdown → HTML
export function md(src = '') {
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/`(.+?)`/g, '<code>$1</code>');
  const lines = src.split('\n'); let html = '', list = null, table = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } if (table) { html += '</table>'; table = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^\s*\|.*\|\s*$/.test(l)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue;
      if (!table) { close(); html += '<table>'; table = 1; }
      html += '<tr>' + l.trim().slice(1, -1).split('|').map(c => `<td>${inline(c.trim())}</td>`).join('') + '</tr>'; continue;
    }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { close(); html += `<h3>${inline(m[2])}</h3>`; continue; }
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; continue; }
    close();
    if (l.trim()) html += `<p>${inline(l)}</p>`;
  }
  close();
  return html;
}
