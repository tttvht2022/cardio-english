// Review mode: SRS flashcards, vocab quiz, clinical quiz, AI-generated quiz, stats
import { ls } from './store.js';
import { bank, saveBank, speak, esc, toast } from './dict.js';
import { ai } from './ai.js';
import { logActivity, streak, goals, today } from './activity.js';

const DAY = 864e5, INTERVAL = [0, 0, 1, 3, 7, 16, 35];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, n) => shuffle(a).slice(0, n);

export function initReview(ctx) {
  const body = document.getElementById('reviewBody');
  const nav = document.getElementById('reviewNav');
  const views = { today: todayView, flash, vocab, clinical, aiq, stats };
  let cur = 'today';
  nav.querySelectorAll('button').forEach(b => b.onclick = () => { nav.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); cur = { today: 'today', flash: 'flash', vocab: 'vocab', clinical: 'clinical', ai: 'aiq', stats: 'stats' }[b.dataset.rv]; views[cur](); });
  return { show: () => views[cur](), go: v => nav.querySelector(`[data-rv="${v}"]`).click() };

  // ----- today dashboard -----
  function todayView() {
    const a = ls.get('activity', {}), t = a[today()] || {}, g = goals(), b = bank();
    const due = b.filter(x => (x.due || 0) <= Date.now()).length;
    const st = streak();
    const bar = (lbl, v, max) => `<div class="goal"><div class="lbl"><span>${lbl}</span><span>${Math.min(v, max)}/${max}${v >= max ? ' ✅' : ''}</span></div><div class="bar"><div style="width:${Math.min(100, 100 * v / max)}%"></div></div></div>`;
    const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); const k = today(d); const n = Object.values(a[k] || {}).reduce((s, v) => s + v, 0); return { k, n, d }; });
    const mx = Math.max(1, ...days.map(x => x.n));
    const last = ls.get('lastPage', null); const lc = last ? ctx.caseAt(last) : null;
    const sugg = ctx.suggestCases(3);
    const tipCat = window.PHRASES[Math.floor(Math.random() * window.PHRASES.length)]; const tip = tipCat.items[Math.floor(Math.random() * tipCat.items.length)];
    body.innerHTML = `<div class="card hero"><div><div class="streak">🔥 ${st}</div><div class="muted small">ngày học liên tiếp</div></div>
      <div style="flex:1;min-width:240px">${bar('Từ mới lưu', t.words || 0, g.words)}${bar('Thẻ đã ôn', t.cards || 0, g.cards)}${bar('Case đã học', t.cases || 0, g.cases)}${bar('Lần luyện nói / nghe–chép', (t.speak || 0) + (t.dict || 0), g.speak)}</div></div>
      <div class="card"><h2>Tiếp tục</h2><div class="row">
        ${last ? `<button class="btn pri" id="tdCont">📖 Đọc tiếp trang ${last}${lc ? ` (Ch.${lc.ch} Case ${lc.n})` : ''}</button>` : ''}
        <button class="btn" id="tdCards" ${due ? '' : 'disabled'}>🃏 Ôn ${due} thẻ đến hạn</button>
        <button class="btn" id="tdQuiz">❓ 10 câu trắc nghiệm nhanh</button></div>
        ${sugg.length ? `<div class="sec">Case gợi ý tiếp theo (theo lộ trình ưu tiên siêu âm)</div><div class="row">${sugg.map(s => `<button class="btn sm" data-ch="${s.ch}" data-n="${s.n}">Ch.${s.ch} · Case ${s.n} <span class="muted small">${esc(window.TOC[s.ch - 1].vi)}</span></button>`).join('')}</div>` : ''}</div>
      <div class="card"><h2>14 ngày qua</h2><div style="display:flex;gap:4px;align-items:flex-end;height:70px">${days.map(x => `<div title="${x.k}: ${x.n} hoạt động" style="flex:1;background:${x.n ? 'var(--ok)' : 'var(--line)'};opacity:${x.n ? .35 + .65 * x.n / mx : 1};height:${x.n ? 15 + 85 * x.n / mx : 6}%;border-radius:3px"></div>`).join('')}</div>
        <div class="row small muted" style="justify-content:space-between"><span>${days[0].d.toLocaleDateString('vi-VN')}</span><span>Hôm nay</span></div></div>
      <div class="card"><h2>Câu của ngày</h2><div class="phrase"><div class="en">${esc(tip.en)}</div><div class="vi">${esc(tip.vi)}</div>${tip.note ? `<div class="note">💡 ${esc(tip.note)}</div>` : ''}</div>
        <div class="row"><button class="btn sm" id="tipSay">🔊 Nghe</button><button class="btn sm" id="tipPr">🎤 Luyện nói</button></div></div>`;
    body.querySelector('#tdCont')?.addEventListener('click', () => ctx.goToPage(last));
    body.querySelector('#tdCards').onclick = () => nav.querySelector('[data-rv="flash"]').click();
    body.querySelector('#tdQuiz').onclick = () => { nav.querySelector('[data-rv="clinical"]').click(); body.querySelector('#qgo').click(); };
    body.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => ctx.openCase(+b.dataset.ch, +b.dataset.n));
    body.querySelector('#tipSay').onclick = () => speak(tip.en);
    body.querySelector('#tipPr').onclick = () => ctx.practice(tip);
  }

  // ----- flashcards (Leitner) -----
  function flash() {
    const b = bank(); const now = Date.now();
    const due = b.map((x, i) => ({ ...x, i })).filter(x => (x.due || 0) <= now);
    if (!b.length) return seedView('Sổ từ đang trống.');
    if (!due.length) {
      const next = Math.min(...b.map(x => x.due || now));
      body.innerHTML = `<div class="card"><h2>Hết thẻ cần ôn hôm nay 🎉</h2><p>Thẻ tiếp theo đến hạn: ${new Date(next).toLocaleString('vi-VN')}.</p><div class="row"><button class="btn" id="cram">Ôn thêm ngẫu nhiên 10 thẻ</button></div></div>`;
      body.querySelector('#cram').onclick = () => run(pick(b.map((x, i) => ({ ...x, i })), 10));
      return;
    }
    run(shuffle(due).slice(0, 30));
    function run(list) {
      let k = 0, flipped = false;
      const show = () => {
        if (k >= list.length) { body.innerHTML = `<div class="card"><h2>Xong ${list.length} thẻ!</h2><button class="btn" id="again">Tiếp tục</button></div>`; body.querySelector('#again').onclick = flash; return; }
        const c = list[k];
        body.innerHTML = `<div class="card"><div class="row"><span class="muted">Thẻ ${k + 1}/${list.length} · hộp ${c.box}</span></div>
          <div class="flash" id="fc"><div class="front">${esc(c.headword)}</div><div class="muted">${flipped ? '' : 'Chạm để lật'}</div>
          ${flipped ? `<div class="back"><div>${esc(c.ipa_uk || '')} ${c.ipa_us && c.ipa_us !== c.ipa_uk ? '· US ' + esc(c.ipa_us) : ''}</div><div class="vi-main">${esc(c.vi || '(chưa có nghĩa)')}</div>${c.sentence ? `<div class="ctx small">${esc(c.sentence)}</div>` : ''}</div>` : ''}</div>
          <div class="row" style="justify-content:center"><button class="btn" id="say">🔊</button>
          ${flipped ? `<button class="btn" data-g="0" style="border-color:var(--bad)">Quên</button><button class="btn" data-g="1">Khó</button><button class="btn" data-g="2" style="border-color:var(--ok)">Nhớ</button>` : ''}</div></div>`;
        body.querySelector('#fc').onclick = () => { flipped = !flipped; show(); };
        body.querySelector('#say').onclick = e => { e.stopPropagation(); speak(c.headword); };
        body.querySelectorAll('[data-g]').forEach(btn => btn.onclick = () => {
          const g = +btn.dataset.g, all = bank(), it = all[c.i]; if (!it) return;
          if (g === 0) { it.box = 1; it.wrong = (it.wrong || 0) + 1; }
          else if (g === 2) { it.box = Math.min(6, (it.box || 1) + 1); it.right = (it.right || 0) + 1; }
          it.due = Date.now() + INTERVAL[it.box] * DAY + (g === 0 ? 60e3 : 0);
          saveBank(all); logStat('flash', g > 0); logActivity('cards', 1); k++; flipped = false; show();
        });
      };
      show();
    }
  }

  function seedView(msg) {
    const tags = { ecg: 'ECG & rối loạn nhịp', echo: 'Siêu âm & bệnh van', general: 'Lâm sàng chung' };
    body.innerHTML = `<div class="card"><h2>${msg}</h2><p>Bấm vào từ trong sách để lưu, hoặc nạp nhanh bộ từ tích hợp:</p><div class="row">${Object.entries(tags).map(([k, v]) => `<button class="btn" data-seed="${k}">＋ ${v} (${window.GLOSSARY.filter(g => g.tag === k).length})</button>`).join('')}</div></div>`;
    body.querySelectorAll('[data-seed]').forEach(b => b.onclick = () => {
      const all = bank(); const have = new Set(all.map(x => x.headword.toLowerCase()));
      window.GLOSSARY.filter(g => g.tag === b.dataset.seed && !have.has(g.w)).forEach(g => all.push({ headword: g.w, vi: g.vi, ipa_uk: g.uk, ipa_us: g.us, sentence: g.ex, def: g.d, box: 1, due: Date.now(), right: 0, wrong: 0, added: Date.now() }));
      saveBank(all); toast('Đã thêm vào sổ từ'); flash();
    });
  }

  // ----- vocab quiz -----
  function vocab() {
    const pool = [...bank().filter(x => x.vi), ...window.GLOSSARY.map(g => ({ headword: g.w, vi: g.vi, ipa_uk: g.uk, sentence: g.ex, gl: 1 }))];
    const uniq = []; const seen = new Set(); for (const x of pool) { const k = x.headword.toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push(x); } }
    const mine = uniq.filter(x => !x.gl);
    const base = mine.length >= 6 ? [...mine, ...pick(uniq.filter(x => x.gl), 6)] : uniq;
    const qs = pick(base, 10).map(item => {
      const types = ['en2vi', 'vi2en', 'listen']; if (item.sentence && new RegExp('\\b' + item.headword.split(' ')[0] + '\\w*', 'i').test(item.sentence)) types.push('cloze');
      const type = types[Math.floor(Math.random() * types.length)];
      const distract = pick(uniq.filter(x => x.headword !== item.headword && x.vi !== item.vi), 3);
      return { item, type, opts: shuffle([item, ...distract]) };
    });
    let k = 0, score = 0;
    const show = () => {
      if (k >= qs.length) { logStat('vocab', null, score, qs.length); logActivity('quiz', qs.length); body.innerHTML = `<div class="card"><h2>Kết quả: ${score}/${qs.length}</h2><button class="btn pri" id="again">Làm đề mới</button></div>`; body.querySelector('#again').onclick = vocab; return; }
      const q = qs[k], it = q.item;
      let prompt, label = o => o.vi;
      if (q.type === 'en2vi') prompt = `Nghĩa của <b style="font-size:20px">${esc(it.headword)}</b> <span class="muted">${esc(it.ipa_uk || '')}</span> là gì?`;
      if (q.type === 'vi2en') { prompt = `Từ tiếng Anh nào nghĩa là: <b>${esc(it.vi)}</b>?`; label = o => o.headword; }
      if (q.type === 'listen') { prompt = `Nghe và chọn từ đúng <button class="btn sm" id="play">🔊 Nghe</button>`; label = o => o.headword; }
      if (q.type === 'cloze') { const re = new RegExp('\\b' + it.headword.split(' ')[0] + '\\w*', 'i'); prompt = `Điền từ vào chỗ trống:<div class="ctx">${esc(it.sentence).replace(re, '_____')}</div>`; label = o => o.headword; }
      body.innerHTML = `<div class="card"><div class="muted">Câu ${k + 1}/${qs.length} · Điểm ${score}</div><p>${prompt}</p>${q.opts.map((o, i) => `<button class="opt" data-i="${i}">${esc(label(o))}</button>`).join('')}<div id="fb"></div></div>`;
      if (q.type === 'listen') { body.querySelector('#play').onclick = () => speak(it.headword); setTimeout(() => speak(it.headword), 300); }
      body.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        const ok = q.opts[+b.dataset.i] === it; if (ok) score++;
        body.querySelectorAll('.opt').forEach((x, i) => { x.disabled = true; if (q.opts[i] === it) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
        body.querySelector('#fb').innerHTML = `<p><b>${esc(it.headword)}</b> ${esc(it.ipa_uk || '')} — ${esc(it.vi)} <button class="btn sm" id="sp2">🔊</button></p><button class="btn pri" id="nx">Tiếp →</button>`;
        body.querySelector('#sp2').onclick = () => speak(it.headword);
        body.querySelector('#nx').onclick = () => { k++; show(); };
        updateBankStat(it.headword, ok);
      });
    };
    show();
  }

  // ----- clinical quiz -----
  function clinical() {
    const ai_q = ls.get('aiQuiz', []);
    const all = [...window.MCQ, ...(window.MCQ_EXTRA || []), ...ai_q];
    const chs = [...new Set(all.map(q => q.ch))].sort((a, b) => a - b);
    const wrongIds = ls.get('wrongQ', []);
    body.innerHTML = `<div class="card"><h2>Trắc nghiệm lâm sàng</h2><p class="muted">${all.length} câu (${window.MCQ.length + (window.MCQ_EXTRA || []).length} câu soạn sẵn + ${ai_q.length} câu AI tạo).</p>
      <div class="row">Chương: <select id="qch"><option value="all">Tất cả</option>${chs.map(c => `<option value="${c}">Ch.${c} · ${esc(window.TOC[c - 1]?.vi || '')}</option>`).join('')}</select>
      Số câu: <select id="qn"><option>10</option><option>20</option><option>30</option></select>
      <button class="btn pri" id="qgo">Bắt đầu</button><button class="btn" id="qwrong" ${wrongIds.length ? '' : 'disabled'}>Ôn ${wrongIds.length} câu từng sai</button></div></div>`;
    const qid = q => (q.ch + '|' + q.q).slice(0, 120);
    body.querySelector('#qgo').onclick = () => { const c = body.querySelector('#qch').value; run(pick(all.filter(q => c === 'all' || q.ch == c), +body.querySelector('#qn').value)); };
    body.querySelector('#qwrong').onclick = () => run(all.filter(q => wrongIds.includes(qid(q))));
    function run(list) {
      let k = 0, score = 0; list = list.map(q => ({ ...q, ord: shuffle([0, 1, 2, 3].slice(0, q.o.length)) }));
      const show = () => {
        if (k >= list.length) { logStat('clinical', null, score, list.length); logActivity('quiz', list.length); body.innerHTML = `<div class="card"><h2>Kết quả: ${score}/${list.length}</h2><button class="btn pri" id="again">Làm lại</button></div>`; body.querySelector('#again').onclick = clinical; return; }
        const q = list[k];
        body.innerHTML = `<div class="card"><div class="muted">Câu ${k + 1}/${list.length} · Ch.${q.ch} · Điểm ${score}</div><p>${q.q}</p>${q.ord.map((o, i) => `<button class="opt" data-i="${i}">${String.fromCharCode(65 + i)}. ${q.o[o]}</button>`).join('')}<div id="fb"></div></div>`;
        body.querySelectorAll('.opt').forEach(b => b.onclick = () => {
          const ok = q.ord[+b.dataset.i] === q.a; if (ok) score++;
          let w = ls.get('wrongQ', []); const id = qid(q);
          w = ok ? w.filter(x => x !== id) : [...new Set([...w, id])]; ls.set('wrongQ', w);
          body.querySelectorAll('.opt').forEach((x, i) => { x.disabled = true; if (q.ord[i] === q.a) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
          body.querySelector('#fb').innerHTML = `${q.e ? `<p class="muted">${q.e}</p>` : ''}<button class="btn pri" id="nx">Tiếp →</button>`;
          body.querySelector('#nx').onclick = () => { k++; show(); };
        });
      };
      show();
    }
  }

  // ----- AI quiz from a case -----
  function aiq() {
    body.innerHTML = `<div class="card"><h2>AI tạo đề từ nội dung sách</h2><p class="muted">AI đọc đúng các trang của case bạn chọn và tạo câu hỏi (lâm sàng + từ vựng). Câu hỏi được lưu vào ngân hàng trắc nghiệm.</p>
      <div class="row">Chương <select id="ach">${window.TOC.map(c => `<option value="${c.num}">${c.num}. ${esc(c.vi)}</option>`).join('')}</select>
      Case <select id="acs"></select> Số câu <select id="an"><option>5</option><option>8</option><option>10</option></select>
      <button class="btn pri" id="ago">Tạo đề</button></div><div id="aout"></div></div>`;
    const ach = body.querySelector('#ach'), acs = body.querySelector('#acs');
    const fill = () => { const c = window.TOC[ach.value - 1]; acs.innerHTML = `<option value="0">Cả chương</option>` + c.cases.map(x => `<option value="${x.n}">Case ${x.n}</option>`).join(''); };
    ach.onchange = fill; fill();
    const cur = ctx.currentCase(); if (cur) { ach.value = cur.ch; fill(); acs.value = cur.n; }
    body.querySelector('#ago').onclick = async () => {
      const out = body.querySelector('#aout');
      if (!ctx.viewer.doc) { out.innerHTML = '<p class="err">Hãy mở file PDF trước.</p>'; return; }
      out.innerHTML = '<p><span class="spinner"></span> Đang đọc sách và tạo câu hỏi…</p>';
      const c = window.TOC[ach.value - 1], n = +acs.value;
      const [a, b] = ctx.casePages(c, n);
      try {
        const text = await ctx.viewer.rangeText(a, b);
        const r = await ai('quiz', { text, n: +body.querySelector('#an').value }, { cache: false });
        const qs = (r.data.questions || []).filter(q => q.q && q.o?.length >= 2).map(q => ({ ch: c.num, q: q.q, o: q.o, a: q.a, e: (q.e || '') + ` (Ch.${c.num}${n ? ' Case ' + n : ''}, tr.${a})` }));
        ls.set('aiQuiz', [...ls.get('aiQuiz', []), ...qs]);
        out.innerHTML = `<p>Đã tạo ${qs.length} câu và lưu vào ngân hàng.</p><button class="btn pri" id="play">Làm ngay</button>`;
        out.querySelector('#play').onclick = () => { clinical(); setTimeout(() => { body.querySelector('#qch').value = c.num; body.querySelector('#qgo').click(); }, 0); };
      } catch (e) { out.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
    };
  }

  // ----- stats -----
  function stats() {
    const b = bank(), st = ls.get('stats', {}), done = ls.get('doneCases', {});
    const due = b.filter(x => (x.due || 0) <= Date.now()).length;
    const mastered = b.filter(x => x.box >= 5).length;
    const acc = k => st[k]?.n ? Math.round(100 * st[k].ok / st[k].n) + '%' : '—';
    body.innerHTML = `<div class="card"><h2>Tiến độ</h2>
      <span class="stat"><b>${b.length}</b>từ trong sổ</span><span class="stat"><b>${due}</b>thẻ đến hạn</span><span class="stat"><b>${mastered}</b>từ đã thuộc (hộp ≥5)</span>
      <span class="stat"><b>${acc('vocab')}</b>đúng – từ vựng</span><span class="stat"><b>${acc('clinical')}</b>đúng – lâm sàng</span><span class="stat"><b>${Object.keys(done).length}</b>case đã học</span></div>
      <div class="card"><h2>Case đã học theo chương</h2>${window.TOC.filter(c => c.cases.length).map(c => { const d = c.cases.filter(x => done[c.num + '-' + x.n]).length; return `<div class="row" style="margin:4px 0"><span style="min-width:240px">${c.num}. ${esc(c.vi)}</span><div class="bar" style="flex:1"><div style="width:${100 * d / c.cases.length}%"></div></div><span class="small muted">${d}/${c.cases.length}</span></div>`; }).join('')}</div>`;
  }
}

export function logStat(kind, ok, score, n) {
  const st = ls.get('stats', {}); st[kind] = st[kind] || { ok: 0, n: 0 };
  if (n != null) { st[kind].ok += score; st[kind].n += n; } else if (ok != null) { st[kind].ok += ok ? 1 : 0; st[kind].n++; }
  ls.set('stats', st);
}
function updateBankStat(w, ok) {
  const b = bank(); const it = b.find(x => x.headword.toLowerCase() === w.toLowerCase()); if (!it) return;
  if (ok) it.right = (it.right || 0) + 1; else { it.wrong = (it.wrong || 0) + 1; it.box = 1; it.due = Date.now(); }
  saveBank(b);
}
