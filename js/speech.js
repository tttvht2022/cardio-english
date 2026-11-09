// Pronunciation practice (speech recognition) & dictation, with word-level diff
import { speak, esc, toast } from './dict.js';
import { ls } from './store.js';
import { logActivity } from './activity.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canRecognize = !!SR;

const norm = s => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9%' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const NUM = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', percent: '%' };
const toks = s => norm(s).split(' ').filter(Boolean).map(w => NUM[w] || w);

// LCS alignment: which target tokens were matched
export function diff(target, said) {
  const a = toks(target), b = toks(said);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ok = new Array(a.length).fill(false); let i = 0, j = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { ok[i] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  const score = a.length ? Math.round(100 * ok.filter(Boolean).length / a.length) : 0;
  return { words: a, ok, score };
}
function renderDiff(d) {
  return d.words.map((w, i) => `<span style="padding:1px 3px;border-radius:4px;${d.ok[i] ? 'background:color-mix(in srgb,var(--ok) 22%,transparent)' : 'background:color-mix(in srgb,var(--bad) 22%,transparent);text-decoration:underline wavy var(--bad)'}">${esc(w)}</span>`).join(' ');
}

let modal;
function ensureModal() {
  if (modal) return modal;
  modal = document.createElement('div');
  modal.className = 'modal hidden';
  modal.innerHTML = `<div class="modal-card"><button class="icon-btn modal-x" title="Đóng">✕</button><div class="modal-body"></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.modal-x').onclick = () => close();
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  return modal;
}
function close() { modal.classList.add('hidden'); try { rec?.abort(); } catch {} speechSynthesis?.cancel(); }
let rec;

export function openPractice(item, mode = 'speak') {
  const text = item.text || item.en || '', vi = item.vi || '', note = item.note || '';
  const m = ensureModal(); m.classList.remove('hidden');
  const body = m.querySelector('.modal-body');
  const accent = ls.get('voice', 'en-GB');
  const tabs = `<div class="row"><button class="btn sm ${mode === 'speak' ? 'pri' : ''}" data-m="speak">🎤 Luyện nói</button><button class="btn sm ${mode === 'dict' ? 'pri' : ''}" data-m="dict">✍️ Nghe – chép</button></div>`;
  if (mode === 'speak') {
    body.innerHTML = `${tabs}<div class="sec">Câu mẫu</div><div class="quote" style="font-size:17px">${esc(text)}</div>
      ${vi ? `<div class="muted small" style="margin-top:6px">${esc(vi)}</div>` : ''}${note ? `<div class="small" style="margin-top:6px">💡 ${esc(note)}</div>` : ''}
      <div class="row"><button class="btn" id="pmUK">🔊 UK</button><button class="btn" id="pmUS">🔊 US</button><button class="btn" id="pmSlow">🐢 Chậm</button>
      <button class="btn pri" id="pmRec" ${canRecognize ? '' : 'disabled'}>🎤 Bấm để nói</button></div>
      ${canRecognize ? '' : '<p class="err small">Trình duyệt này không hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome hoặc Edge (máy tính/Android).</p>'}
      <div id="pmOut"></div>`;
    body.querySelector('#pmUK').onclick = () => speak(text, 'en-GB');
    body.querySelector('#pmUS').onclick = () => speak(text, 'en-US');
    body.querySelector('#pmSlow').onclick = () => { const r = ls.get('rate', 0.9); ls.set('rate', 0.65); speak(text, accent); ls.set('rate', r); };
    body.querySelector('#pmRec').onclick = () => listen(text, body.querySelector('#pmOut'), body.querySelector('#pmRec'));
  } else {
    body.innerHTML = `${tabs}<p>Nghe câu và chép lại chính xác (không cần dấu câu).</p>
      <div class="row"><button class="btn pri" id="dPlay">🔊 Nghe</button><button class="btn" id="dSlow">🐢 Nghe chậm</button></div>
      <textarea id="dIn" rows="3" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--bg)" placeholder="Gõ những gì bạn nghe được…"></textarea>
      <div class="row"><button class="btn pri" id="dCheck">Kiểm tra</button><button class="btn" id="dShow">Hiện đáp án</button></div><div id="dOut"></div>`;
    const play = rate => { const r = ls.get('rate', 0.9); ls.set('rate', rate); speak(text, accent); ls.set('rate', r); };
    body.querySelector('#dPlay').onclick = () => play(ls.get('rate', 0.9));
    body.querySelector('#dSlow').onclick = () => play(0.65);
    setTimeout(() => play(ls.get('rate', 0.9)), 250);
    body.querySelector('#dCheck').onclick = () => {
      const d = diff(text, body.querySelector('#dIn').value);
      body.querySelector('#dOut').innerHTML = `<div class="sec">Điểm: ${d.score}%</div><div style="line-height:2">${renderDiff(d)}</div>${vi ? `<p class="muted small">${esc(vi)}</p>` : ''}`;
      logActivity('dict', 1); saveScore('dict', text, d.score);
    };
    body.querySelector('#dShow').onclick = () => { body.querySelector('#dOut').innerHTML = `<div class="quote">${esc(text)}</div>${vi ? `<p class="muted small">${esc(vi)}</p>` : ''}`; };
  }
  body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => openPractice({ text, vi, note }, b.dataset.m));
}

function listen(text, out, btn) {
  try { rec?.abort(); } catch {}
  rec = new SR(); rec.lang = ls.get('voice', 'en-GB'); rec.interimResults = true; rec.maxAlternatives = 3; rec.continuous = false;
  let finalTxt = '', best = null;
  btn.disabled = true; btn.textContent = '🔴 Đang nghe…';
  out.innerHTML = '<p class="muted">Hãy đọc to câu mẫu…</p>';
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        // choose the alternative that best matches the target
        let top = r[0].transcript, ts = diff(text, top).score;
        for (let k = 1; k < r.length; k++) { const s = diff(text, r[k].transcript).score; if (s > ts) { ts = s; top = r[k].transcript; } }
        finalTxt += ' ' + top;
      } else interim += r[0].transcript;
    }
    out.innerHTML = `<p class="muted">${esc((finalTxt + ' ' + interim).trim())}</p>`;
  };
  rec.onerror = e => { out.innerHTML = `<p class="err">Lỗi micro: ${esc(e.error)}${e.error === 'not-allowed' ? ' – hãy cho phép trình duyệt dùng micro.' : ''}</p>`; };
  rec.onend = () => {
    btn.disabled = false; btn.textContent = '🎤 Nói lại';
    if (!finalTxt.trim()) { if (!out.querySelector('.err')) out.innerHTML = '<p class="muted">Không nghe rõ, hãy thử lại.</p>'; return; }
    best = diff(text, finalTxt);
    const verdict = best.score >= 90 ? '🌟 Rất tốt!' : best.score >= 70 ? '👍 Khá tốt — chú ý các từ gạch đỏ.' : '💪 Cần luyện thêm — nghe mẫu rồi đọc chậm lại.';
    out.innerHTML = `<div class="sec">Điểm phát âm: ${best.score}% · ${verdict}</div><div style="line-height:2">${renderDiff(best)}</div>
      <div class="small muted" style="margin-top:6px">Máy nghe được: “${esc(finalTxt.trim())}”</div>
      <div class="small muted">Bấm vào từ đỏ để nghe riêng từ đó.</div>`;
    out.querySelectorAll('span').forEach((s, i) => { if (!best.ok[i]) { s.style.cursor = 'pointer'; s.onclick = () => speak(best.words[i]); } });
    logActivity('speak', 1); saveScore('speak', text, best.score);
  };
  rec.start();
}

function saveScore(kind, text, score) {
  const h = ls.get('practice', []); h.unshift({ kind, text: text.slice(0, 200), score, t: Date.now() }); ls.set('practice', h.slice(0, 300));
}
