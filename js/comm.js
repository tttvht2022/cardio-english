// "Giao tiếp" mode: phrasebook, ECG/echo report builders, speaking & dictation practice
import { speak, esc, bank, toast } from './dict.js';
import { openPractice, canRecognize } from './speech.js';
import { ls } from './store.js';

export function initComm() {
  const nav = document.getElementById('commNav'), body = document.getElementById('commBody');
  const views = { phrases, ecg, echo, practice, history };
  let cur = 'phrases';
  nav.querySelectorAll('button').forEach(b => b.onclick = () => { nav.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); cur = b.dataset.cv; views[cur](); });
  return { show: () => views[cur]() };

  function phraseRow(p) {
    return `<div class="phrase"><div class="en">${esc(p.en)}</div><div class="vi">${esc(p.vi)}</div>${p.note ? `<div class="note">💡 ${esc(p.note)}</div>` : ''}
      <div class="row"><button class="btn sm" data-say="${esc(p.en)}" data-l="en-GB">🔊 UK</button><button class="btn sm" data-say="${esc(p.en)}" data-l="en-US">🔊 US</button>
      <button class="btn sm" data-pr="${esc(JSON.stringify(p))}" data-m="speak">🎤 Luyện nói</button><button class="btn sm" data-pr="${esc(JSON.stringify(p))}" data-m="dict">✍️ Nghe – chép</button></div></div>`;
  }
  function bindRows(root) {
    root.querySelectorAll('[data-say]').forEach(b => b.onclick = () => speak(b.dataset.say, b.dataset.l));
    root.querySelectorAll('[data-pr]').forEach(b => b.onclick = () => openPractice(JSON.parse(b.dataset.pr), b.dataset.m));
  }

  function phrases() {
    body.innerHTML = `<div class="card"><h2>Mẫu câu lâm sàng</h2><p class="muted small">Cách nói chuẩn khi giao ban, viết báo cáo, nói chuyện với bệnh nhân. Mỗi câu có ghi chú ngữ pháp, nghe mẫu UK/US, luyện nói có chấm điểm và nghe–chép.</p>
      <input id="phQ" placeholder="Tìm mẫu câu (tiếng Anh hoặc tiếng Việt)…" class="input"></div><div id="phList"></div>`;
    const draw = q => {
      q = (q || '').toLowerCase();
      body.querySelector('#phList').innerHTML = window.PHRASES.map(c => {
        const items = c.items.filter(p => !q || (p.en + p.vi).toLowerCase().includes(q));
        return items.length ? `<div class="card"><h3 style="margin-top:0">${esc(c.cat)}</h3>${items.map(phraseRow).join('')}</div>` : '';
      }).join('') || '<div class="empty">Không tìm thấy.</div>';
      bindRows(body);
    };
    body.querySelector('#phQ').oninput = e => draw(e.target.value); draw();
  }

  // ---------- ECG report builder ----------
  function ecg() {
    const RH = [
      ['sinus rhythm', 'nhịp xoang'], ['sinus tachycardia', 'nhịp nhanh xoang'], ['sinus bradycardia', 'nhịp chậm xoang'],
      ['atrial fibrillation', 'rung nhĩ'], ['atrial flutter with 2:1 conduction', 'cuồng nhĩ dẫn truyền 2:1'], ['atrial flutter with variable conduction', 'cuồng nhĩ dẫn truyền thay đổi'],
      ['a regular narrow complex tachycardia', 'nhịp nhanh QRS hẹp đều'], ['atrial tachycardia', 'nhanh nhĩ'], ['multifocal atrial tachycardia', 'nhanh nhĩ đa ổ'],
      ['a broad complex tachycardia', 'nhịp nhanh QRS rộng'], ['ventricular tachycardia', 'nhịp nhanh thất'], ['complete heart block with a junctional escape rhythm', 'block nhĩ thất hoàn toàn với nhịp thoát bộ nối'],
      ['complete heart block with a ventricular escape rhythm', 'block nhĩ thất hoàn toàn với nhịp thoát thất'], ['a paced rhythm', 'nhịp máy tạo nhịp']];
    const sel = (id, opts) => `<select id="${id}">${opts.map((o, i) => `<option value="${i}">${esc(o[1])}</option>`).join('')}</select>`;
    const AX = [['normal', 'bình thường'], ['left axis deviation', 'lệch trái'], ['right axis deviation', 'lệch phải'], ['extreme axis deviation', 'vô định']];
    const PR = [['normal', 'bình thường'], ['prolonged', 'kéo dài'], ['short', 'ngắn'], ['not measurable', 'không đo được']];
    const QRS = [['narrow', 'hẹp'], ['right bundle branch block', 'block nhánh phải'], ['left bundle branch block', 'block nhánh trái'], ['broad, with a non-specific intraventricular conduction delay', 'rộng, rối loạn dẫn truyền trong thất không đặc hiệu']];
    const EXTRA = [['retrograde P waves after each QRS complex', 'sóng P ngược dòng sau mỗi QRS'], ['no visible P waves', 'không thấy sóng P'], ['a pseudo r′ wave in V1', 'pseudo r′ ở V1'], ['saw-tooth flutter waves in the inferior leads', 'sóng cuồng răng cưa ở chuyển đạo dưới'],
      ['a delta wave with a short PR interval', 'sóng delta với PR ngắn'], ['QRS alternans', 'QRS so le'], ['AV dissociation', 'phân ly nhĩ thất'], ['left ventricular hypertrophy by voltage criteria', 'phì đại thất trái theo tiêu chuẩn điện thế'],
      ['right ventricular hypertrophy', 'phì đại thất phải'], ['pathological Q waves in the inferior leads', 'sóng Q bệnh lý ở chuyển đạo dưới'], ['a prolonged QT interval', 'QT kéo dài'], ['low QRS voltages', 'điện thế QRS thấp']];
    body.innerHTML = `<div class="card"><h2>Viết kết luận ECG bằng tiếng Anh</h2><p class="muted small">Chọn các thành phần — app ghép thành đoạn mô tả ECG chuẩn văn phong y khoa, kèm bản dịch. Có thể nghe và luyện nói ngay.</p>
      <div class="form-grid">
       <label>Nhịp ${sel('eR', RH)}</label>
       <label>Tần số (lần/phút)<input id="eRate" type="number" value="150" min="20" max="300"></label>
       <label>Trục ${sel('eAx', AX)}</label>
       <label>PR ${sel('ePR', PR)}</label>
       <label>QRS ${sel('eQ', QRS)}</label>
       <label>ST ${sel('eST', [['no significant ST changes', 'không biến đổi ST'], ['ST elevation', 'ST chênh lên'], ['ST depression', 'ST chênh xuống']])}</label>
       <label>ST ở chuyển đạo<input id="eSTl" value="II, III and aVF"></label>
       <label>ST soi gương ở<input id="eRecip" value="I and aVL" placeholder="để trống nếu không"></label>
       <label>T âm ở<input id="eT" placeholder="vd: V1–V3"></label>
      </div>
      <div class="sec">Dấu hiệu khác</div><div class="chips sel">${EXTRA.map((x, i) => `<label><input type="checkbox" value="${i}"> ${esc(x[1])}</label>`).join('')}</div>
      <label style="margin-top:10px;display:block">Kết luận / chẩn đoán<input id="eDx" class="input" placeholder="vd: typical AVNRT"></label>
      </div><div class="card" id="eOut"></div>`;
    const upd = () => {
      const v = id => +body.querySelector('#' + id).value, t = id => body.querySelector('#' + id).value.trim();
      const r = RH[v('eR')], ax = AX[v('eAx')], pr = PR[v('ePR')], q = QRS[v('eQ')], stK = v('eST');
      const ex = [...body.querySelectorAll('.chips.sel input:checked')].map(i => EXTRA[+i.value]);
      const rate = t('eRate');
      let en = `The ECG shows ${r[0]}${rate ? ` at a rate of approximately ${rate} beats per minute` : ''}. ${ax[0] === 'normal' ? 'The QRS axis is normal' : 'There is ' + ax[0]}. `;
      let vi = `ECG: ${r[1]}${rate ? `, tần số khoảng ${rate} lần/phút` : ''}. Trục QRS ${ax[1]}. `;
      en += pr[0] === 'normal' ? 'The PR interval is normal' : pr[0] === 'not measurable' ? 'The PR interval cannot be measured' : `The PR interval is ${pr[0]}`;
      vi += `PR ${pr[1]}`;
      en += q[0] === 'narrow' ? ' and the QRS complexes are narrow. ' : `, and the QRS complexes show ${q[0].startsWith('broad') ? 'a ' + q[0] : q[0]}. `;
      vi += `, QRS ${q[1]}. `;
      if (stK === 0) { en += 'There are no significant ST-segment changes. '; vi += 'Không có biến đổi ST đáng kể. '; }
      else { const kind = stK === 1 ? 'elevation' : 'depression'; en += `There is ST-segment ${kind} in leads ${t('eSTl') || '…'}`; vi += `ST chênh ${stK === 1 ? 'lên' : 'xuống'} ở ${t('eSTl') || '…'}`;
        if (t('eRecip')) { en += `, with reciprocal ST ${stK === 1 ? 'depression' : 'elevation'} in leads ${t('eRecip')}`; vi += `, kèm thay đổi soi gương ở ${t('eRecip')}`; }
        en += '. '; vi += '. '; }
      if (t('eT')) { en += `There is T-wave inversion in leads ${t('eT')}. `; vi += `T âm ở ${t('eT')}. `; }
      if (ex.length) { en += 'Other findings include ' + listJoin(ex.map(x => x[0])) + '. '; vi += 'Dấu hiệu khác: ' + ex.map(x => x[1]).join(', ') + '. '; }
      if (t('eDx')) { en += `These findings are consistent with ${t('eDx')}.`; vi += `Kết luận: phù hợp ${t('eDx')}.`; }
      outBox(body.querySelector('#eOut'), en.trim(), vi.trim());
    };
    body.querySelectorAll('input,select').forEach(x => x.addEventListener('input', upd)); upd();
  }

  // ---------- Echo report builder ----------
  function echo() {
    const SEV = ['none', 'trivial', 'mild', 'moderate', 'severe'], SEVVI = ['không', 'vết', 'nhẹ', 'vừa', 'nặng'];
    const sevSel = id => `<select id="${id}">${SEV.map((s, i) => `<option value="${i}">${SEVVI[i]}</option>`).join('')}</select>`;
    body.innerHTML = `<div class="card"><h2>Viết báo cáo siêu âm tim bằng tiếng Anh</h2><p class="muted small">Theo cấu trúc báo cáo ASE: thất trái → thất phải → van → áp lực phổi → màng ngoài tim → IVC → kết luận.</p>
      <div class="form-grid">
       <label>Kích thước LV <select id="lvS"><option value="normal in size">bình thường</option><option value="mildly dilated">giãn nhẹ</option><option value="moderately dilated">giãn vừa</option><option value="severely dilated">giãn nặng</option></select></label>
       <label>Thành LV <select id="lvW"><option value="normal wall thickness">dày thành bình thường</option><option value="concentric left ventricular hypertrophy">phì đại đồng tâm</option><option value="asymmetric septal hypertrophy">phì đại vách không đối xứng</option></select></label>
       <label>LVEF (%)<input id="ef" type="number" value="60" min="5" max="80"></label>
       <label>Rối loạn vận động vùng<input id="rwma" placeholder="vd: the inferior and inferolateral walls are akinetic"></label>
       <label>Chức năng RV <select id="rv"><option value="normal size and systolic function">bình thường</option><option value="dilated with reduced systolic function">giãn, giảm chức năng</option><option value="normal in size with reduced systolic function">không giãn, giảm chức năng</option></select></label>
       <label>TAPSE (mm)<input id="tapse" type="number" placeholder="vd: 20"></label>
       <label>Hở hai lá ${sevSel('mr')}</label><label>Cơ chế MR<input id="mrM" placeholder="vd: a flail posterior leaflet"></label>
       <label>Hẹp hai lá ${sevSel('ms')}</label><label>Hẹp van ĐMC ${sevSel('as')}</label>
       <label>Hở van ĐMC ${sevSel('ar')}</label><label>Hở ba lá ${sevSel('tr')}</label>
       <label>PASP (mmHg)<input id="pasp" type="number" placeholder="vd: 45"></label>
       <label>Tràn dịch MNT <select id="pe"><option value="">không</option><option value="a small">ít</option><option value="a moderate">vừa</option><option value="a large">nhiều</option></select></label>
       <label>Chèn ép <select id="tamp"><option value="0">không có dấu hiệu</option><option value="1">có dấu hiệu chèn ép</option></select></label>
       <label>IVC <select id="ivc"><option value="normal in size with more than 50 percent inspiratory collapse">bình thường, xẹp >50%</option><option value="dilated with less than 50 percent inspiratory collapse">giãn, xẹp <50%</option><option value="dilated and plethoric">giãn, không xẹp</option></select></label>
      </div></div><div class="card" id="cOut"></div>`;
    const SEVVI2 = SEVVI;
    const upd = () => {
      const g = id => body.querySelector('#' + id).value.trim(), gi = id => +g(id);
      const ef = gi('ef'); const fn = ef >= 55 ? 'preserved' : ef >= 41 ? 'mildly reduced' : ef >= 30 ? 'moderately reduced' : 'severely reduced';
      const fnvi = ef >= 55 ? 'bảo tồn' : ef >= 41 ? 'giảm nhẹ' : ef >= 30 ? 'giảm vừa' : 'giảm nặng';
      let en = `The left ventricle is ${g('lvS')} with ${g('lvW')}. Left ventricular systolic function is ${fn}, with an estimated ejection fraction of ${ef} percent. `;
      let vi = `Thất trái ${body.querySelector('#lvS').selectedOptions[0].text}, ${body.querySelector('#lvW').selectedOptions[0].text}. Chức năng tâm thu thất trái ${fnvi}, EF ước tính ${ef}%. `;
      if (g('rwma')) { en += cap(g('rwma')) + '. '; vi += 'Rối loạn vận động vùng: ' + g('rwma') + '. '; } else { en += 'There are no regional wall motion abnormalities. '; vi += 'Không rối loạn vận động vùng. '; }
      en += `The right ventricle has ${g('rv')}${g('tapse') ? ` (TAPSE ${g('tapse')} millimetres)` : ''}. `; vi += `Thất phải ${body.querySelector('#rv').selectedOptions[0].text}${g('tapse') ? ` (TAPSE ${g('tapse')} mm)` : ''}. `;
      const valves = [['mr', 'mitral regurgitation', 'hở van hai lá'], ['ms', 'mitral stenosis', 'hẹp van hai lá'], ['as', 'aortic stenosis', 'hẹp van ĐMC'], ['ar', 'aortic regurgitation', 'hở van ĐMC'], ['tr', 'tricuspid regurgitation', 'hở van ba lá']];
      const found = valves.filter(v => gi(v[0]) > 0);
      if (!found.length) { en += 'The cardiac valves are structurally and functionally normal. '; vi += 'Các van tim bình thường. '; }
      for (const [id, name, nvi] of found) {
        en += `There is ${SEV[gi(id)]} ${name}${id === 'mr' && g('mrM') ? ' due to ' + g('mrM') : ''}. `;
        vi += `${cap(nvi)} ${SEVVI2[gi(id)]}${id === 'mr' && g('mrM') ? ' do ' + g('mrM') : ''}. `;
      }
      if (g('pasp')) { const p = +g('pasp'); en += `The estimated pulmonary artery systolic pressure is ${p} millimetres of mercury${p > 35 ? ', suggesting pulmonary hypertension' : ''}. `; vi += `PASP ước tính ${p} mmHg${p > 35 ? ', gợi ý tăng áp phổi' : ''}. `; }
      if (g('pe')) { en += `There is ${g('pe')} pericardial effusion ${g('tamp') === '1' ? 'with echocardiographic signs of tamponade' : 'without echocardiographic signs of tamponade'}. `; vi += `Tràn dịch màng ngoài tim ${body.querySelector('#pe').selectedOptions[0].text}, ${g('tamp') === '1' ? 'có' : 'không có'} dấu hiệu chèn ép tim. `; }
      else { en += 'There is no pericardial effusion. '; vi += 'Không tràn dịch màng ngoài tim. '; }
      en += `The inferior vena cava is ${g('ivc')}.`; vi += `TMC dưới ${body.querySelector('#ivc').selectedOptions[0].text}.`;
      outBox(body.querySelector('#cOut'), en, vi);
    };
    body.querySelectorAll('input,select').forEach(x => x.addEventListener('input', upd)); upd();
  }

  function outBox(el, en, vi) {
    el.innerHTML = `<div class="sec">Bản tiếng Anh</div><div class="quote" style="max-height:none;font-size:15.5px">${esc(en)}</div>
      <div class="sec">Bản dịch</div><p>${esc(vi)}</p>
      <div class="row"><button class="btn sm" id="oUK">🔊 UK</button><button class="btn sm" id="oUS">🔊 US</button><button class="btn sm" id="oStop">■</button><button class="btn sm" id="oCopy">📋 Sao chép</button>
      <button class="btn sm pri" id="oPr">🎤 Luyện đọc báo cáo</button></div>`;
    el.querySelector('#oUK').onclick = () => speak(en, 'en-GB'); el.querySelector('#oUS').onclick = () => speak(en, 'en-US');
    el.querySelector('#oStop').onclick = () => speechSynthesis.cancel();
    el.querySelector('#oCopy').onclick = () => navigator.clipboard?.writeText(en + '\n\n' + vi).then(() => toast('Đã sao chép'));
    el.querySelector('#oPr').onclick = () => { const s = en.match(/[^.]+\./g) || [en]; openPractice({ text: s[0].trim(), vi: 'Luyện từng câu: bấm lại để chuyển câu khác.' }); };
  }

  // ---------- practice from bank & book ----------
  function practice() {
    const b = bank().filter(x => x.sentence && x.sentence.split(' ').length >= 5);
    const pool = [...b.map(x => ({ en: x.sentence, vi: x.vi ? `Từ khoá: ${x.headword} – ${x.vi}` : '' })),
      ...window.PHRASES.flatMap(c => c.items), ...window.GLOSSARY.filter(g => g.ex).map(g => ({ en: g.ex, vi: g.exVi }))];
    const pickOne = () => pool[Math.floor(Math.random() * pool.length)];
    body.innerHTML = `<div class="card"><h2>Luyện nói & nghe–chép ngẫu nhiên</h2>
      <p class="muted small">Câu lấy từ sổ từ của bạn (câu ngữ cảnh trong sách), mẫu câu lâm sàng và ví dụ của từ điển. ${canRecognize ? '' : '<b class="err">Trình duyệt này không hỗ trợ nhận dạng giọng nói — vẫn dùng được nghe–chép.</b>'}</p>
      <div class="row"><button class="btn pri" id="rSpeak">🎤 Câu ngẫu nhiên – luyện nói</button><button class="btn" id="rDict">✍️ Câu ngẫu nhiên – nghe chép</button></div>
      <p class="small muted">${b.length} câu từ sổ từ · ${pool.length} câu tổng cộng</p></div>`;
    body.querySelector('#rSpeak').onclick = () => { const p = pickOne(); openPractice({ text: p.en, vi: p.vi, note: p.note }, 'speak'); };
    body.querySelector('#rDict').onclick = () => { const p = pickOne(); openPractice({ text: p.en, vi: p.vi }, 'dict'); };
  }

  function history() {
    const h = ls.get('practice', []);
    if (!h.length) { body.innerHTML = '<div class="card"><div class="empty">Chưa có lần luyện nào.</div></div>'; return; }
    const avg = k => { const a = h.filter(x => x.kind === k); return a.length ? Math.round(a.reduce((s, x) => s + x.score, 0) / a.length) + '%' : '—'; };
    body.innerHTML = `<div class="card"><h2>Lịch sử luyện</h2><span class="stat"><b>${avg('speak')}</b>điểm nói trung bình</span><span class="stat"><b>${avg('dict')}</b>điểm nghe–chép trung bình</span></div>
      <div class="card">${h.slice(0, 60).map((x, i) => `<div class="bank-item"><div><span class="small muted">${new Date(x.t).toLocaleString('vi-VN')} · ${x.kind === 'speak' ? '🎤' : '✍️'}</span><div>${esc(x.text)}</div></div><div><b>${x.score}%</b> <button class="btn sm" data-i="${i}">↻</button></div></div>`).join('')}</div>`;
    body.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const x = h[+b.dataset.i]; openPractice({ text: x.text }, x.kind); });
  }
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const listJoin = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
