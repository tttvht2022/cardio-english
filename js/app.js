import { ls, idb } from './store.js';
import { ai, checkAI, aiStatus, md } from './ai.js';
import { Viewer, markTerms } from './pdfview.js';
import { initComm } from './comm.js';
import { openPractice } from './speech.js';
import { getIndex, search, escapeRe } from './search.js';
import { logActivity, goals } from './activity.js';
import { showWord, showPassage, renderBank, bank, speak, toast, esc, exportAnki, glossaryHit } from './dict.js';
import { initReview } from './review.js';

const $ = s => document.querySelector(s);
const TOC = window.TOC;

// ---------- helpers ----------
const chapterOf = p => TOC.find(c => p >= c.start && p <= c.end);
function caseOf(p) { const c = chapterOf(p); if (!c) return null; let cur = null; for (const x of c.cases) if (x.page <= p) cur = x; return cur ? { ch: c.num, n: cur.n, page: cur.page } : null; }
function casePages(c, n) {
  if (!n) return [c.start, Math.min(c.ref, c.start + 6)];
  const i = c.cases.findIndex(x => x.n === n); const a = c.cases[i].page;
  const b = (c.cases[i + 1]?.page ?? c.ref);
  return [a, Math.min(Math.max(a, b), a + 4)];
}

// ---------- viewer ----------
let currentCase = null;
const viewer = new Viewer($('#viewer'), {
  onPage: p => {
    $('#pageInput').value = p;
    const c = chapterOf(p), cs = caseOf(p);
    $('#crumb').textContent = c ? `Ch.${c.num} ${c.title}${cs ? ' · Case ' + cs.n : ''} — tr.${p}` : `Trang ${p}`;
    ls.set('lastPage', p);
    const key = cs ? cs.ch + '-' + cs.n : null;
    if (key !== (currentCase && currentCase.ch + '-' + currentCase.n)) { currentCase = cs; renderLesson(); }
  },
  onWord: info => { setTab('word'); hidePop(); showWord($('#tab-word'), { ...info, ch: chapterOf(info.page)?.num }); },
  onSelect: info => showPop(info),
  onTextLayer: (pageEl, p) => decorate(pageEl, p),
});

// ---------- on-page decorations: saved words + search hits ----------
let savedRe = null, findRe = null, findPage = 0;
function buildSavedRe() {
  const words = bank().map(x => x.headword.trim()).filter(w => w.length > 2).sort((a, b) => b.length - a.length);
  savedRe = words.length ? new RegExp('\\b(' + words.map(w => escapeRe(w).replace(/\s+/g, '\\s+')).join('|') + ')(s|es|ed|ing)?\\b', 'gi') : null;
}
function decorate(pageEl, p) {
  if (ls.get('hlSaved', true)) markTerms(pageEl, savedRe, 'saved-hl'); else pageEl.querySelectorAll('.saved-hl').forEach(x => x.remove());
  if (findRe && Math.abs(p - findPage) <= 1) markTerms(pageEl, findRe, 'find-hl'); else pageEl.querySelectorAll('.find-hl').forEach(x => x.remove());
}
function redecorate() { document.querySelectorAll('.pdfpage').forEach(d => { if (d.querySelector('.textLayer')) decorate(d, +d.dataset.p); }); }
buildSavedRe();
document.addEventListener('bank-changed', () => { buildSavedRe(); redecorate(); renderLessonVocabMarks(); });

async function openPdf(fileOrBlob, store = true) {
  $('#pdfStatus').textContent = 'Đang mở sách…';
  try {
    const buf = await fileOrBlob.arrayBuffer();
    const n = await viewer.open(new Uint8Array(buf));
    if (store) { idb.set('files', 'book', fileOrBlob).catch(() => {}); }
    $('#pageTotal').textContent = '/ ' + n;
    if (n !== window.PDF_PAGES) toast(`File có ${n} trang (bản chuẩn ${window.PDF_PAGES}). Phụ lục có thể lệch trang.`);
    const last = ls.get('lastPage', TOC[0].start);
    goToPage(last, false);
  } catch (e) { console.error(e); $('#pdfStatus').textContent = 'Không mở được file: ' + e.message; }
}
function goToPage(p, mark) {
  if (!viewer.doc) return toast('Hãy mở file PDF trước');
  p = Math.max(1, Math.min(viewer.doc.numPages, p));
  const c = chapterOf(p);
  const [a, b] = c ? [c.start, c.end] : [Math.max(1, p - 10), Math.min(viewer.doc.numPages, p + 10)];
  viewer.showRange(a, b);
  requestAnimationFrame(() => viewer.scrollTo(p, mark));
}
$('#pdfFile').onchange = e => e.target.files[0] && openPdf(e.target.files[0]);
$('#pdfFile2').onchange = e => { if (e.target.files[0]) { setMode('read'); openPdf(e.target.files[0]); } };
$('#forgetPdf').onclick = async () => { await idb.del('files', 'book'); toast('Đã xoá PDF khỏi trình duyệt'); };
$('#pageInput').onchange = e => goToPage(+e.target.value);
$('#prevPage').onclick = () => goToPage(viewer.current - 1);
$('#nextPage').onclick = () => goToPage(viewer.current + 1);
$('#zoomIn').onclick = () => { viewer.zoom = Math.min(2.5, viewer.zoom + 0.15); viewer.relayout(); };
$('#zoomOut').onclick = () => { viewer.zoom = Math.max(0.5, viewer.zoom - 0.15); viewer.relayout(); };

// ---------- TOC ----------
function renderToc(filter = '') {
  const f = filter.trim().toLowerCase(); const done = ls.get('doneCases', {});
  $('#tocList').innerHTML = TOC.filter(c => !f || (c.title + ' ' + c.vi + ' ' + c.num).toLowerCase().includes(f)).map(c => `
    <div class="ch"><div class="ch-h" data-ch="${c.num}"><span class="n">${c.num}</span><span>${esc(c.title)}<span class="vi">${esc(c.vi)} · ${c.cases.length} case · tr.${c.start}–${c.end}</span></span></div>
    <div class="ch-cases hidden" id="cc${c.num}">${c.cases.map(x => `<button data-ch="${c.num}" data-n="${x.n}" class="${window.NOTES[c.num + '-' + x.n] ? 'has-note' : ''} ${done[c.num + '-' + x.n] ? 'done' : ''}" title="${esc(x.t || 'trang ' + x.page)}">Case ${x.n}</button>`).join('')}
    <button data-ch="${c.num}" data-n="0">Đầu chương</button></div></div>`).join('');
  $('#tocList').querySelectorAll('.ch-h').forEach(h => h.onclick = () => $('#cc' + h.dataset.ch).classList.toggle('hidden'));
  $('#tocList').querySelectorAll('.ch-cases button').forEach(b => b.onclick = () => openCase(+b.dataset.ch, +b.dataset.n));
}
function openCase(ch, n) {
  closeToc(); setMode('read');
  const c = TOC[ch - 1]; const page = n ? c.cases.find(x => x.n === n).page : c.start;
  currentCase = n ? { ch, n, page } : null;
  if (!viewer.doc) { toast('Hãy mở file PDF trước'); renderLesson(); setTab('lesson'); return; }
  goToPage(page, !!n); setTab('lesson'); renderLesson();
}
const openToc = () => { $('#toc').classList.add('open'); $('#scrim').classList.add('on'); };
const closeToc = () => { $('#toc').classList.remove('open'); $('#scrim').classList.remove('on'); };
$('#tocBtn').onclick = openToc; $('#tocClose').onclick = closeToc; $('#scrim').onclick = closeToc;
$('#tocSearch').oninput = e => renderToc(e.target.value);
renderToc();
document.querySelectorAll('.toc-tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.toc-tabs button').forEach(x => x.classList.toggle('on', x === b));
  $('#ttToc').classList.toggle('hidden', b.dataset.tt !== 'toc'); $('#ttFind').classList.toggle('hidden', b.dataset.tt !== 'find');
  if (b.dataset.tt === 'find') { $('#findQ').focus(); prepIndex(); }
});
let idx = null;
async function prepIndex() {
  if (idx || !viewer.doc) { if (!viewer.doc) $('#findInfo').textContent = 'Hãy mở file PDF trước.'; return; }
  $('#findInfo').textContent = 'Đang lập chỉ mục toàn bộ sách (chỉ lần đầu, ~1 phút)…';
  idx = await getIndex(viewer, (p, n) => { $('#findInfo').textContent = `Đang lập chỉ mục… ${p}/${n} trang`; });
  $('#findInfo').textContent = 'Sẵn sàng. Gõ ít nhất 2 ký tự.'; if ($('#findQ').value) runFind();
}
let ft;
$('#findQ').oninput = () => { clearTimeout(ft); ft = setTimeout(runFind, 250); };
function runFind() {
  const q = $('#findQ').value; if (!idx) return prepIndex();
  const res = search(idx, q);
  $('#findInfo').textContent = q.trim().length < 2 ? '' : `${res.length >= 300 ? '300+' : res.length} kết quả`;
  $('#findList').innerHTML = res.map((r, i) => { const c = chapterOf(r.page), cs = caseOf(r.page); return `<div class="find-item" data-i="${i}"><div class="loc">Tr.${r.page}${c ? ` · Ch.${c.num}` : ''}${cs ? ` · Case ${cs.n}` : ''}</div>${esc(r.before)}<mark>${esc(r.hit)}</mark>${esc(r.after)}</div>`; }).join('');
  $('#findList').querySelectorAll('.find-item').forEach(el => el.onclick = () => {
    const r = res[+el.dataset.i]; findRe = new RegExp(escapeRe(q.trim()).replace(/\s+/g, '\\s+'), 'gi'); findPage = r.page;
    closeToc(); setMode('read'); goToPage(r.page); setTimeout(redecorate, 600); setTimeout(redecorate, 1500);
  });
}

// ---------- tabs & modes ----------
function setTab(t) {
  document.querySelectorAll('#studyTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.study-body .tab').forEach(x => x.classList.toggle('hidden', x.id !== 'tab-' + t));
  if (t === 'bank') renderBank($('#tab-bank'), it => { setTab('word'); showWord($('#tab-word'), { word: it.headword, sentence: it.sentence, page: it.page }); });
}
document.querySelectorAll('#studyTabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
const PRIORITY = [7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 1, 2, 3, 4, 11, 5, 6, 20, 21, 22, 23, 24, 25, 26, 27, 28];
function suggestCases(k) {
  const done = ls.get('doneCases', {}); const out = [];
  for (const ch of PRIORITY) for (const x of TOC[ch - 1].cases) { if (!done[ch + '-' + x.n]) { out.push({ ch, n: x.n }); if (out.length >= k) return out; } }
  return out;
}
const review = initReview({ viewer, casePages, currentCase: () => currentCase, caseAt: caseOf, suggestCases, goToPage: p => { setMode('read'); goToPage(p); }, openCase: (c, n) => openCase(c, n), practice: p => openPractice(p) });
const comm = initComm();
function setMode(m) {
  document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  ['read', 'review', 'comm', 'settings'].forEach(x => $('#mode-' + x).classList.toggle('hidden', x !== m));
  if (m === 'review') review.show();
  if (m === 'comm') comm.show();
  if (m === 'settings') refreshAIStatus();
}
document.querySelectorAll('.modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));

// ---------- lesson tab ----------
function renderLesson() {
  const el = $('#tab-lesson');
  if (!currentCase) { el.innerHTML = '<div class="empty">Chọn một case trong <b>Phụ lục</b> (☰) hoặc cuộn tới một case để bắt đầu học.</div>'; return; }
  const { ch, n, page } = currentCase; const c = TOC[ch - 1]; const key = ch + '-' + n;
  const note = window.NOTES[key]; const done = ls.get('doneCases', {});
  el.innerHTML = `<h2 style="margin:0">Ch.${ch} · Case ${n}</h2><div class="muted small">${esc(c.title)} — ${esc(c.vi)} · bắt đầu trang ${page}</div>
   <div class="row"><button class="btn sm" id="goCase">↪ Về trang case</button><button class="btn sm ${done[key] ? 'pri' : ''}" id="doneCase">${done[key] ? '✓ Đã học' : 'Đánh dấu đã học'}</button>
   ${n > 1 ? `<button class="btn sm" id="prevCase">‹ Case ${n - 1}</button>` : ''}${c.cases.some(x => x.n > n) ? `<button class="btn sm" id="nextCase">Case kế ›</button>` : ''}</div>
   ${note ? `<div class="sec">Ghi chú lâm sàng soạn sẵn</div><p><b>${esc(note.title)}</b></p><ol>${note.qs.map(q => `<li>${q}</li>`).join('')}</ol>
     <p class="muted small">Tự trả lời các câu hỏi trong sách trước, rồi mở đáp án.</p><button class="btn pri sm" id="showAns">Xem đáp án & giải thích</button>
     <div id="ansBox" class="hidden"><div class="note-ans">${note.ans}</div><div>${note.exp}</div>${note.pearls?.length ? `<div class="pearl"><b>Pearls</b><ul>${note.pearls.map(p => `<li>${p}</li>`).join('')}</ul></div>` : ''}${note.update ? `<div class="upd">${note.update}</div>` : ''}</div>`
    : `<p class="muted small">Case này chưa có ghi chú soạn sẵn — dùng AI để soạn bài học từ đúng các trang sách.</p>`}
   ${window.CH_SUMMARY[ch] ? `<div class="row"><button class="btn sm" id="sumBtn">Tóm tắt Chương ${ch}</button></div><div id="sumBox" class="hidden">${window.CH_SUMMARY[ch]}</div>` : ''}
   <div class="sec">Từ vựng chuyên ngành của case này</div><div id="caseVocab" class="chips"><span class="muted small">${viewer.doc ? '<span class="spinner"></span> đang quét các trang của case…' : 'Mở file PDF để quét từ vựng.'}</span></div>
   <div class="sec">AI</div><div class="row"><button class="btn sm" id="aiLesson">Soạn bài học case này (VN + từ vựng)</button><button class="btn sm" id="aiQuiz">Tạo câu hỏi ôn tập</button></div>
   <div id="aiLessonOut" class="md"></div>`;
  el.querySelector('#goCase').onclick = () => goToPage(page, true);
  el.querySelector('#doneCase').onclick = () => { const d = ls.get('doneCases', {}); if (d[key]) delete d[key]; else { d[key] = Date.now(); logActivity('cases', 1); } ls.set('doneCases', d); renderLesson(); renderToc($('#tocSearch').value); };
  el.querySelector('#prevCase')?.addEventListener('click', () => openCase(ch, c.cases[c.cases.findIndex(x => x.n === n) - 1].n));
  el.querySelector('#nextCase')?.addEventListener('click', () => openCase(ch, c.cases[c.cases.findIndex(x => x.n === n) + 1].n));
  el.querySelector('#showAns')?.addEventListener('click', e => { el.querySelector('#ansBox').classList.remove('hidden'); e.target.remove(); });
  el.querySelector('#sumBtn')?.addEventListener('click', () => el.querySelector('#sumBox').classList.toggle('hidden'));
  el.querySelector('#aiLesson').onclick = async () => {
    const out = el.querySelector('#aiLessonOut'); out.innerHTML = '<p><span class="spinner"></span> AI đang đọc các trang của case…</p>';
    try { const [a, b] = casePages(c, n); const text = await viewer.rangeText(a, b); const r = await ai('lesson', { chapter: ch, case: n, text }); out.innerHTML = md(r.text); }
    catch (e) { out.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  };
  el.querySelector('#aiQuiz').onclick = () => { setMode('review'); document.querySelector('[data-rv="ai"]').click(); };
  if (viewer.doc) caseVocab(c, n, key);
}
async function caseVocab(c, n, key) {
  const [a, b] = casePages(c, n); const text = await viewer.rangeText(a, b, 20000);
  if (!currentCase || currentCase.ch + '-' + currentCase.n !== key) return;
  const box = document.getElementById('caseVocab'); if (!box) return;
  const found = [];
  for (const g of window.GLOSSARY) {
    const re = new RegExp('\\b' + escapeRe(g.w).replace(/\s+/g, '\\s+') + '(s|es|ed|ing|al)?\\b', 'gi');
    const m = text.match(re); if (m) found.push({ g, n: m.length });
  }
  found.sort((x, y) => y.n - x.n);
  box.innerHTML = found.length ? found.slice(0, 30).map(f => `<button class="cv-chip" data-w="${esc(f.g.w)}" title="${esc(f.g.vi)}">${esc(f.g.w)} <small>×${f.n}</small></button>`).join('')
    + `<button class="btn sm" id="saveAllCv">＋ Lưu tất cả vào sổ từ</button>` : '<span class="muted small">Không có thuật ngữ trong từ điển tích hợp — hãy bấm trực tiếp vào từ trong sách.</span>';
  const sentenceOf = w => { const m = text.match(new RegExp('[^.]*\\b' + escapeRe(w).replace(/\s+/g, '\\s+') + '[^.]*\\.', 'i')); return m ? m[0].replace(/\[page \d+\]/g, '').trim().slice(0, 400) : ''; };
  box.querySelectorAll('.cv-chip').forEach(bt => bt.onclick = () => { setTab('word'); showWord($('#tab-word'), { word: bt.dataset.w, sentence: sentenceOf(bt.dataset.w), page: a, ch: c.num }); });
  box.querySelector('#saveAllCv')?.addEventListener('click', () => {
    const all = bank(); const have = new Set(all.map(x => x.headword.toLowerCase())); let k = 0;
    for (const f of found) if (!have.has(f.g.w.toLowerCase())) { all.unshift({ headword: f.g.w, vi: f.g.vi, ipa_uk: f.g.uk, ipa_us: f.g.us, sentence: sentenceOf(f.g.w) || f.g.ex, page: a, ch: c.num, box: 1, due: Date.now(), right: 0, wrong: 0, added: Date.now() }); k++; }
    ls.set('bank', all); $('#bankCount').textContent = all.length; logActivity('words', k); toast(`Đã thêm ${k} từ`); document.dispatchEvent(new Event('bank-changed'));
  });
  renderLessonVocabMarks();
}
function renderLessonVocabMarks() {
  const have = new Set(bank().map(x => x.headword.toLowerCase()));
  document.querySelectorAll('.cv-chip').forEach(b => b.classList.toggle('saved', have.has(b.dataset.w.toLowerCase())));
}

// ---------- selection popover ----------
let selInfo = null, popAt = 0;
function showPop(info) {
  selInfo = info; popAt = Date.now(); const p = $('#selPop'); p.classList.remove('hidden');
  const r = info.rect; const top = Math.max(60, r.top - 46); const left = Math.min(window.innerWidth - 280, Math.max(8, r.left));
  p.style.top = top + 'px'; p.style.left = left + 'px';
}
function hidePop() { $('#selPop').classList.add('hidden'); }
$('#selAnalyze').onclick = () => { hidePop(); setTab('passage'); showPassage($('#tab-passage'), selInfo); };
$('#selSpeak').onclick = () => speak(selInfo.text);
$('#selAsk').onclick = () => { hidePop(); setTab('chat'); $('#chatInput').value = `Giải thích đoạn này: "${selInfo.text}"`; $('#chatInput').focus(); };
document.addEventListener('pointerdown', e => { if (!e.target.closest('#selPop') && !e.target.closest('.textLayer')) hidePop(); });
$('#viewer').addEventListener('scroll', () => { if (Date.now() - popAt > 400) hidePop(); });

// ---------- chat ----------
const chat = ls.get('chat', []);
function renderChat() {
  const log = $('#chatLog');
  if (!chat.length) return;
  log.innerHTML = chat.map(m => `<div class="msg ${m.role === 'user' ? 'user' : 'ai'}">${m.role === 'user' ? esc(m.content) : `<div class="md">${md(m.content)}</div>`}</div>`).join('') + `<div class="row"><button class="btn sm" id="clearChat">Xoá hội thoại</button></div>`;
  log.querySelector('#clearChat').onclick = () => { chat.length = 0; ls.set('chat', []); log.innerHTML = '<div class="empty">Đã xoá.</div>'; };
  log.scrollTop = log.scrollHeight;
}
renderChat();
$('#chatForm').onsubmit = async e => {
  e.preventDefault(); const q = $('#chatInput').value.trim(); if (!q) return;
  chat.push({ role: 'user', content: q }); $('#chatInput').value = ''; renderChat();
  const log = $('#chatLog'); log.insertAdjacentHTML('beforeend', '<div class="msg ai" id="pending"><span class="spinner"></span></div>'); log.scrollTop = log.scrollHeight;
  let context = '';
  try { if (viewer.doc) { const p = viewer.current; context = await viewer.rangeText(Math.max(1, p - 1), Math.min(viewer.doc.numPages, p + 1), 9000); } } catch {}
  try {
    const r = await ai('chat', { messages: chat.slice(-12), context: (currentCase ? `Chapter ${currentCase.ch}, Case ${currentCase.n}. ` : '') + context }, { cache: false });
    chat.push({ role: 'assistant', content: r.text }); ls.set('chat', chat.slice(-40)); renderChat();
  } catch (err) { $('#pending')?.remove(); log.insertAdjacentHTML('beforeend', `<div class="msg ai err">${esc(err.message)}</div>`); chat.pop(); }
};
$('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); } });
document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { $('#chatInput').value = b.dataset.q; $('#chatInput').focus(); });

// ---------- settings ----------
async function refreshAIStatus() {
  const s = await checkAI(); const el = $('#aiStatus');
  el.innerHTML = s.ok ? `✅ AI đang hoạt động · model: ${s.providers.map(esc).join(' → ')}${s.needsCode ? ' · cần mã truy cập' : ''}`
    : s.offline ? '⚠️ Không gọi được /api/ai (bạn đang mở file tĩnh? Hãy chạy trên Vercel).' : '⚠️ AI chưa được cấu hình: thêm biến môi trường ANTHROPIC_API_KEY trên Vercel rồi Redeploy.';
}
$('#accessCode').value = ls.get('accessCode', '');
$('#saveCode').onclick = async () => { ls.set('accessCode', $('#accessCode').value.trim()); await refreshAIStatus(); toast('Đã lưu'); };
$('#clearCache').onclick = async () => { await idb.clear('cache'); toast('Đã xoá bộ nhớ đệm AI'); };
$('#voicePref').value = ls.get('voice', 'en-GB'); $('#voicePref').onchange = e => ls.set('voice', e.target.value);
$('#rate').value = ls.get('rate', 0.9); $('#rate').onchange = e => ls.set('rate', +e.target.value);
$('#hlSaved').checked = ls.get('hlSaved', true); $('#hlSaved').onchange = e => { ls.set('hlSaved', e.target.checked); redecorate(); };
{ const g = goals(); [['gWords', 'words'], ['gCards', 'cards'], ['gCases', 'cases'], ['gSpeak', 'speak']].forEach(([id, k]) => { $('#' + id).value = g[k]; $('#' + id).onchange = e => { const cur = ls.get('goals', {}); cur[k] = Math.max(1, +e.target.value || 1); ls.set('goals', cur); }; }); }
$('#exportAnki').onclick = exportAnki;
$('#exportData').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(ls.dump())], { type: 'application/json' })); a.download = 'cardioenglish-backup.json'; a.click(); };
$('#importData').onchange = async e => { try { ls.load(JSON.parse(await e.target.files[0].text())); toast('Đã khôi phục, đang tải lại…'); setTimeout(() => location.reload(), 800); } catch { toast('File không hợp lệ'); } };

// ---------- divider ----------
(() => {
  const d = $('#divider'), book = $('#bookPane'); let drag = false;
  d.onpointerdown = e => { drag = true; d.setPointerCapture(e.pointerId); };
  d.onpointermove = e => { if (!drag) return; const pct = Math.min(80, Math.max(30, 100 * e.clientX / window.innerWidth)); book.style.flex = `0 0 ${pct}%`; };
  d.onpointerup = () => { drag = false; viewer.relayout(); };
})();

// ---------- keyboard shortcuts ----------
document.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select,[contenteditable]')) return;
  if (e.key === 'Escape') { closeToc(); hidePop(); document.querySelector('.modal:not(.hidden) .modal-x')?.click(); }
  if ($('#mode-read').classList.contains('hidden')) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goToPage(viewer.current + 1); }
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goToPage(viewer.current - 1); }
  if (e.key === '/') { e.preventDefault(); openToc(); document.querySelector('[data-tt="find"]').click(); }
  if (e.key === 't' || e.key === 'T') openToc();
});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- boot ----------
$('#bankCount').textContent = bank().length;
checkAI();
(async () => {
  const blob = await idb.get('files', 'book');
  if (blob) openPdf(blob, false);
})();
