// Word lookup & passage analysis panels
import { ai, aiStatus, md } from './ai.js';
import { ls } from './store.js';
import { logActivity } from './activity.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GL = new Map(window.GLOSSARY.map(g => [g.w.toLowerCase(), g]));

export function lemmas(w) {
  w = w.toLowerCase().replace(/[’]/g, "'").replace(/'s$/, '');
  const c = [w];
  if (w.endsWith('ies')) c.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) c.push(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) c.push(w.slice(0, -1));
  if (w.endsWith('ied')) c.push(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) { c.push(w.slice(0, -2), w.slice(0, -1)); if (/(.)\1ed$/.test(w)) c.push(w.slice(0, -3)); }
  if (w.endsWith('ing')) { c.push(w.slice(0, -3), w.slice(0, -3) + 'e'); if (/(.)\1ing$/.test(w)) c.push(w.slice(0, -4)); }
  if (w.endsWith('ly')) c.push(w.slice(0, -2), w.slice(0, -4) + 'al');
  if (w.endsWith('ae')) c.push(w.slice(0, -1));
  if (w.endsWith('a') && !w.endsWith('ia')) c.push(w.slice(0, -1) + 'um'); // atria → atrium
  return [...new Set(c)];
}
export function glossaryHit(w) {
  for (const l of lemmas(w)) if (GL.has(l)) return GL.get(l);
  // multiword glossary terms containing the word as head
  for (const [k, g] of GL) if (k.includes(' ') && k.split(' ').includes(w.toLowerCase())) return g;
  return null;
}

// ---------- speech ----------
let voices = [];
function loadVoices() { voices = speechSynthesis?.getVoices?.() || []; }
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
export function speak(text, lang) {
  if (!('speechSynthesis' in window)) return toast('Trình duyệt không hỗ trợ đọc.');
  lang = lang || ls.get('voice', 'en-GB');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = +ls.get('rate', 0.9);
  const v = voices.find(v => v.lang === lang && /Google|Natural|Premium|Enhanced/i.test(v.name)) || voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith('en'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
export function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600); }

// ---------- free dictionary (no key, IPA + audio) ----------
const fdCache = new Map();
async function freeDict(word) {
  for (const l of lemmas(word)) {
    if (fdCache.has(l)) { if (fdCache.get(l)) return fdCache.get(l); continue; }
    try {
      const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(l));
      if (!r.ok) { fdCache.set(l, null); continue; }
      const j = await r.json(); const e = j[0];
      const phon = (e.phonetics || []);
      const audioUK = phon.find(p => /-uk\.mp3/.test(p.audio))?.audio, audioUS = phon.find(p => /-us\.mp3/.test(p.audio))?.audio;
      const out = { headword: e.word, ipa: e.phonetic || phon.find(p => p.text)?.text, audioUK, audioUS,
        meanings: (e.meanings || []).slice(0, 2).map(m => ({ pos: m.partOfSpeech, defs: m.definitions.slice(0, 2).map(d => ({ d: d.definition, ex: d.example })) })) };
      fdCache.set(l, out); return out;
    } catch { fdCache.set(l, null); }
  }
  return null;
}

// ---------- bank ----------
export function bank() { return ls.get('bank', []); }
export function saveBank(b) { ls.set('bank', b); document.getElementById('bankCount').textContent = b.length; }
export function addToBank(item) {
  const b = bank(); const k = item.headword.toLowerCase();
  const i = b.findIndex(x => x.headword.toLowerCase() === k);
  const base = { box: 1, due: Date.now(), right: 0, wrong: 0, added: Date.now() };
  if (i >= 0) b[i] = { ...b[i], ...item, box: b[i].box, due: b[i].due, right: b[i].right, wrong: b[i].wrong, added: b[i].added };
  else { b.unshift({ ...base, ...item }); logActivity('words', 1); }
  saveBank(b); toast(i >= 0 ? 'Đã cập nhật trong sổ từ' : 'Đã lưu vào sổ từ'); document.dispatchEvent(new Event('bank-changed'));
}

// ---------- word card ----------
let wordSeq = 0;
export async function showWord(el, { word, sentence, page, ch }) {
  const my = ++wordSeq;
  const g = glossaryHit(word);
  const head = g?.w || word;
  const markSent = sentence ? esc(sentence).replace(new RegExp('\\b(' + word.replace(/[^A-Za-z]/g, '') + ')\\b', 'i'), '<mark>$1</mark>') : '';
  const cam = encodeURIComponent(head.toLowerCase().replace(/\s+/g, '-'));
  const state = { headword: head, vi: g?.vi || '', ipa_uk: g?.uk || '', ipa_us: g?.us || '', sentence, page, ch, def: g?.d || '' };

  el.innerHTML = `<div class="wcard">
    <h2><span id="wHead">${esc(head)}</span><span class="pos" id="wPos">${esc(g?.pos || '')}</span></h2>
    <div class="pron">
      <span><b>UK</b> <span class="ipa" id="ipaUK">${esc(g?.uk || '…')}</span> <button class="spk" data-l="en-GB">🔊 UK</button></span>
      <span><b>US</b> <span class="ipa" id="ipaUS">${esc(g?.us || '…')}</span> <button class="spk" data-l="en-US">🔊 US</button></span>
      <span id="audioBtns"></span>
    </div>
    <div class="vi-main" id="wVi">${esc(g?.vi || '')}</div>
    ${g ? `<div>${esc(g.d)}</div>` : ''}
    ${sentence ? `<div class="sec">Ngữ cảnh trong sách · trang ${page}</div><div class="ctx">${markSent} <button class="spk" id="spkSent">🔊 câu</button></div>` : ''}
    ${g?.ex ? `<div class="sec">Ví dụ</div><div class="ex">${esc(g.ex)}<div class="vi">${esc(g.exVi || '')}</div></div>` : ''}
    <div id="fdBox"></div>
    <div id="aiBox" class="ai-box"><div class="hd">AI · nghĩa theo ngữ cảnh</div><span class="spinner"></span> đang phân tích…</div>
    <div class="row"><button class="btn pri" id="saveWord">＋ Lưu vào sổ từ</button>
    <span class="links"><a target="_blank" rel="noopener" href="https://dictionary.cambridge.org/dictionary/english/${cam}">Cambridge (phát âm chuẩn)</a><a target="_blank" rel="noopener" href="https://dictionary.cambridge.org/dictionary/english-vietnamese/${cam}">Cambridge Anh–Việt</a></span></div>
  </div>`;
  el.querySelectorAll('.spk[data-l]').forEach(b => b.onclick = () => speak(state.headword, b.dataset.l));
  el.querySelector('#spkSent')?.addEventListener('click', () => speak(sentence));
  el.querySelector('#saveWord').onclick = () => addToBank({ ...state });

  // free dictionary in parallel
  freeDict(word).then(fd => {
    if (my !== wordSeq || !fd) return;
    if (!state.ipa_uk && fd.ipa) { el.querySelector('#ipaUK').textContent = fd.ipa; el.querySelector('#ipaUS').textContent = fd.ipa; state.ipa_uk = state.ipa_us = fd.ipa; }
    const ab = el.querySelector('#audioBtns');
    if (fd.audioUK) ab.insertAdjacentHTML('beforeend', `<button class="spk" data-a="${fd.audioUK}">▶ giọng thật UK</button> `);
    if (fd.audioUS) ab.insertAdjacentHTML('beforeend', `<button class="spk" data-a="${fd.audioUS}">▶ giọng thật US</button>`);
    ab.querySelectorAll('[data-a]').forEach(b => b.onclick = () => new Audio(b.dataset.a).play());
    if (!g && fd.meanings?.length) {
      if (!state.def) state.def = fd.meanings[0].defs[0]?.d || '';
      el.querySelector('#fdBox').innerHTML = `<div class="sec">Định nghĩa (English)</div>` + fd.meanings.map(m => `<div class="ex"><i>${esc(m.pos)}</i> — ${m.defs.map(d => esc(d.d) + (d.ex ? `<div class="vi">“${esc(d.ex)}”</div>` : '')).join('<br>')}</div>`).join('');
      if (!el.querySelector('#wPos').textContent) el.querySelector('#wPos').textContent = fd.meanings[0].pos;
    }
  });

  // AI contextual card
  const box = el.querySelector('#aiBox');
  try {
    const r = await ai('word', { word, sentence });
    if (my !== wordSeq) return;
    const d = r.data || {};
    if (d.headword) { state.headword = d.headword; el.querySelector('#wHead').textContent = d.headword; }
    if (d.pos) el.querySelector('#wPos').textContent = d.pos;
    if (d.ipa_uk) { el.querySelector('#ipaUK').textContent = d.ipa_uk; state.ipa_uk = d.ipa_uk; }
    if (d.ipa_us) { el.querySelector('#ipaUS').textContent = d.ipa_us; state.ipa_us = d.ipa_us; }
    if (d.vi) { el.querySelector('#wVi').textContent = d.vi; state.vi = d.vi; }
    if (d.definition_en) state.def = d.definition_en;
    box.innerHTML = `<div class="hd">AI · nghĩa theo ngữ cảnh${r.cached ? ' (đã lưu)' : ''}</div>
      ${d.stress_tip ? `<div class="small muted">Trọng âm: ${esc(d.stress_tip)}</div>` : ''}
      ${d.meaning_in_context ? `<p>${esc(d.meaning_in_context)}</p>` : ''}
      ${d.definition_en ? `<p class="small"><i>${esc(d.definition_en)}</i></p>` : ''}
      ${d.medical_note ? `<div class="sec">Ghi chú lâm sàng</div><p>${esc(d.medical_note)}</p>` : ''}
      ${d.examples?.length ? `<div class="sec">Ví dụ</div>${d.examples.map(x => `<div class="ex">${esc(x.en)} <button class="spk" data-s="${esc(x.en)}">🔊</button><div class="vi">${esc(x.vi)}</div></div>`).join('')}` : ''}
      ${d.collocations?.length ? `<div class="sec">Cụm từ hay gặp</div><div class="chips">${d.collocations.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      ${d.word_family?.length ? `<div class="sec">Họ từ</div><div class="chips">${d.word_family.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      ${d.synonyms?.length ? `<div class="sec">Đồng nghĩa</div><div class="chips">${d.synonyms.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      ${d.confusables ? `<div class="sec">Dễ nhầm</div><p>${esc(d.confusables)}</p>` : ''}`;
    box.querySelectorAll('[data-s]').forEach(b => b.onclick = () => speak(b.dataset.s));
    state.examples = d.examples; state.collocations = d.collocations;
  } catch (e) {
    if (my !== wordSeq) return;
    box.innerHTML = e.kind === 'config'
      ? `<div class="hd">AI chưa bật</div><div class="small muted">${g ? 'Từ này có trong từ điển tim mạch tích hợp (ở trên). ' : ''}Nghĩa tiếng Việt theo ngữ cảnh, ví dụ, cụm từ… sẽ hiện khi bạn thêm API key trên Vercel. Tạm thời dùng liên kết Cambridge Anh–Việt bên dưới.</div>`
      : `<div class="err">${esc(e.message)}</div><button class="btn sm" id="retryW">Thử lại</button>`;
    box.querySelector('#retryW')?.addEventListener('click', () => showWord(el, { word, sentence, page, ch }));
  }
}

// ---------- passage ----------
let pSeq = 0;
export async function showPassage(el, { text, page }) {
  const my = ++pSeq;
  el.innerHTML = `<div class="sec">Đoạn đã chọn · trang ${page}</div><div class="quote">${esc(text)}</div>
   <div class="row"><button class="btn sm" id="pSpeakUK">🔊 Đọc UK</button><button class="btn sm" id="pSpeakUS">🔊 Đọc US</button><button class="btn sm" id="pStop">■</button>
   <a class="btn sm" target="_blank" rel="noopener" href="https://translate.google.com/?sl=en&tl=vi&text=${encodeURIComponent(text.slice(0, 4500))}">Google Dịch</a></div>
   <div id="pOut"><span class="spinner"></span> AI đang dịch & phân tích…</div>`;
  el.querySelector('#pSpeakUK').onclick = () => speak(text, 'en-GB');
  el.querySelector('#pSpeakUS').onclick = () => speak(text, 'en-US');
  el.querySelector('#pStop').onclick = () => speechSynthesis.cancel();
  const out = el.querySelector('#pOut');
  if (text.length > 6000) { out.innerHTML = '<div class="err">Đoạn quá dài (>6000 ký tự). Hãy chọn ngắn hơn.</div>'; return; }
  try {
    const r = await ai('passage', { text, page });
    if (my !== pSeq) return;
    const d = r.data;
    out.innerHTML = `
      <div class="sec">Dịch sát nghĩa</div><p>${esc(d.translation)}</p>
      ${d.natural ? `<div class="sec">Dịch thoát ý</div><p>${esc(d.natural)}</p>` : ''}
      <div class="sec">Ý nghĩa & thông điệp lâm sàng</div><p>${esc(d.meaning)}</p>
      ${d.grammar?.length ? `<div class="sec">Phân tích ngữ pháp</div>${d.grammar.map(g => `<div class="gram"><div class="seg">“${esc(g.segment)}”</div><div>${esc(g.analysis)}</div></div>`).join('')}` : ''}
      ${d.structures?.length ? `<div class="sec">Mẫu câu đáng học</div>${d.structures.map(s => `<div class="ex"><b>${esc(s.pattern)}</b> — ${esc(s.use)}<div class="vi">${esc(s.example)}</div></div>`).join('')}` : ''}
      ${d.vocab?.length ? `<div class="sec">Từ vựng</div><table class="t">${d.vocab.map((v, i) => `<tr><td><b>${esc(v.term)}</b> <button class="spk" data-s="${esc(v.term)}">🔊</button></td><td>${esc(v.ipa)}</td><td>${esc(v.vi)}</td><td><button class="btn sm" data-add="${i}">＋</button></td></tr>`).join('')}</table>` : ''}
      ${d.clinical_check ? `<div class="upd">${esc(d.clinical_check)}</div>` : ''}
      <div class="small muted">${r.cached ? 'Kết quả đã lưu' : 'Model: ' + esc(r.model || '')}</div>`;
    out.querySelectorAll('[data-s]').forEach(b => b.onclick = () => speak(b.dataset.s));
    out.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { const v = d.vocab[+b.dataset.add]; addToBank({ headword: v.term, vi: v.vi, ipa_uk: v.ipa, ipa_us: v.ipa, sentence: text.slice(0, 400), page }); });
  } catch (e) {
    if (my !== pSeq) return;
    out.innerHTML = e.kind === 'config'
      ? `<div class="ai-box"><div class="hd">AI chưa bật</div>Bản dịch sát nghĩa và phân tích ngữ pháp cần AI. Khi bạn thêm API key trên Vercel, tính năng sẽ tự hoạt động. Tạm thời có thể nghe đọc hoặc mở Google Dịch ở trên.</div>`
      : `<div class="err">${esc(e.message)}</div><button class="btn sm" id="retryP">Thử lại</button>`;
    out.querySelector('#retryP')?.addEventListener('click', () => showPassage(el, { text, page }));
  }
}

export function renderBank(el, onOpen) {
  const b = bank();
  if (!b.length) { el.innerHTML = '<div class="empty">Sổ từ trống. Bấm một từ trong sách rồi chọn “Lưu vào sổ từ”.</div>'; return; }
  el.innerHTML = `<div class="row"><b>${b.length} từ</b><button class="btn sm" id="bankReview">Ôn ngay</button><button class="btn sm" id="bankAnki">Xuất Anki</button></div>` + b.map((x, i) => `<div class="bank-item"><div><span class="w" data-i="${i}">${esc(x.headword)}</span> <span class="muted small">${esc(x.ipa_uk || '')}</span><div class="small">${esc(x.vi || '')}</div>${x.sentence ? `<div class="small muted">“${esc(x.sentence.slice(0, 120))}…” · tr.${x.page || ''}</div>` : ''}</div><div><span class="box-badge">hộp ${x.box}</span> <button class="btn sm" data-sp="${i}">🔊</button>${x.sentence ? ` <button class="btn sm" data-prc="${i}" title="Luyện nói câu ngữ cảnh">🎤</button>` : ''} <button class="btn sm" data-del="${i}">✕</button></div></div>`).join('');
  el.querySelectorAll('[data-sp]').forEach(x => x.onclick = () => speak(b[+x.dataset.sp].headword));
  el.querySelectorAll('[data-prc]').forEach(x => x.onclick = async () => { const it = b[+x.dataset.prc]; (await import('./speech.js')).openPractice({ text: it.sentence, vi: `Từ khoá: ${it.headword} – ${it.vi || ''}` }); });
  el.querySelectorAll('[data-del]').forEach(x => x.onclick = () => { b.splice(+x.dataset.del, 1); saveBank(b); renderBank(el, onOpen); });
  el.querySelectorAll('.w').forEach(x => x.onclick = () => onOpen?.(b[+x.dataset.i]));
  el.querySelector('#bankReview').onclick = () => document.querySelector('[data-mode="review"]').click();
  el.querySelector('#bankAnki').onclick = exportAnki;
}
export { esc, md };

export function exportAnki() {
  const b = bank(); if (!b.length) return toast('Sổ từ trống');
  const q = s => '"' + String(s || '').replace(/"/g, '""') + '"';
  const rows = b.map(x => [q(x.headword + (x.ipa_uk ? ' ' + x.ipa_uk : '')), q((x.vi || '') + (x.sentence ? '<br><i>' + x.sentence + '</i>' : '') + (x.page ? ' (tr.' + x.page + ')' : ''))].join(','));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv' })); a.download = 'cardioenglish-anki.csv'; a.click();
}
