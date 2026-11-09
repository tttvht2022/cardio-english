// PDF viewer: lazy page rendering + selectable text layer + word/selection hooks
const pdfjsLib = window.pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../lib/pdfjs/pdf.worker.min.js', import.meta.url).href;

export class Viewer {
  constructor(el, { onPage, onWord, onSelect, onTextLayer }) {
    this.el = el; this.onTextLayer = onTextLayer; this.onPage = onPage; this.onWord = onWord; this.onSelect = onSelect;
    this.doc = null; this.zoom = 1; this.range = [1, 1]; this.pages = new Map(); this.textCache = new Map();
    this.current = 1;
    this.renderObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) this.render(+e.target.dataset.p); }), { root: el, rootMargin: '800px 0px' });
    this.freeObs = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) this.free(+e.target.dataset.p); }), { root: el, rootMargin: '4000px 0px' });
    this.visObs = new IntersectionObserver(es => {
      es.forEach(e => this.vis.set(+e.target.dataset.p, e.intersectionRatio));
      let best = this.current, br = 0; for (const [p, r] of this.vis) if (r > br) { br = r; best = p; }
      if (best !== this.current) { this.current = best; this.onPage?.(best); }
    }, { root: el, threshold: [0, .25, .5, .75, 1] });
    this.vis = new Map();
    this.bindPointer();
    let rt; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => this.relayout(), 250); }).observe(el);
  }

  async open(data) {
    this.doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
    const p1 = await this.doc.getPage(Math.min(30, this.doc.numPages));
    this.baseVp = p1.getViewport({ scale: 1 });
    return this.doc.numPages;
  }

  width() { return Math.max(280, (this.el.clientWidth - 30)) * this.zoom; }

  showRange(a, b, goto) {
    a = Math.max(1, a); b = Math.min(this.doc.numPages, b);
    const same = this.range[0] === a && this.range[1] === b && this.el.querySelector('.pdfpage');
    if (!same) {
      this.renderObs.disconnect(); this.freeObs.disconnect(); this.visObs.disconnect(); this.vis.clear();
      this.pages.clear(); this.el.innerHTML = ''; this.range = [a, b];
      const w = this.width(), h = w * this.baseVp.height / this.baseVp.width;
      for (let p = a; p <= b; p++) {
        const d = document.createElement('div');
        d.className = 'pdfpage'; d.dataset.p = p; d.style.width = w + 'px'; d.style.height = h + 'px';
        d.innerHTML = `<span class="pno">${p}</span>`;
        this.el.appendChild(d);
        this.renderObs.observe(d); this.freeObs.observe(d); this.visObs.observe(d);
      }
    }
    if (goto) this.scrollTo(goto);
  }

  scrollTo(p, mark) {
    const d = this.el.querySelector(`.pdfpage[data-p="${p}"]`);
    if (!d) return false;
    this.el.querySelectorAll('.case-start').forEach(x => x.classList.remove('case-start'));
    if (mark) { d.classList.add('case-start'); setTimeout(() => d.classList.remove('case-start'), 2500); }
    this.el.scrollTop = d.offsetTop - 10;
    this.current = p; this.onPage?.(p);
    return true;
  }

  relayout() {
    if (!this.doc) return;
    const w = this.width();
    this.el.querySelectorAll('.pdfpage').forEach(d => {
      const p = +d.dataset.p, st = this.pages.get(p);
      const vp = st?.vp1 || this.baseVp;
      d.style.width = w + 'px'; d.style.height = (w * vp.height / vp.width) + 'px';
      if (st) { this.free(p); }
    });
    const cur = this.current;
    requestAnimationFrame(() => { this.scrollTo(cur); this.el.querySelectorAll('.pdfpage').forEach(d => { this.renderObs.unobserve(d); this.renderObs.observe(d); }); });
  }

  free(p) {
    const st = this.pages.get(p); if (!st) return;
    st.task?.cancel?.();
    const d = this.el.querySelector(`.pdfpage[data-p="${p}"]`);
    if (d) d.querySelectorAll('canvas,.textLayer,.word-hl,.saved-hl,.find-hl').forEach(x => x.remove());
    this.pages.delete(p);
  }

  async render(p) {
    if (this.pages.has(p) || !this.doc) return;
    const d = this.el.querySelector(`.pdfpage[data-p="${p}"]`); if (!d) return;
    const st = {}; this.pages.set(p, st);
    try {
      const page = await this.doc.getPage(p);
      const vp1 = page.getViewport({ scale: 1 }); st.vp1 = vp1;
      const cssW = this.width(), scale = cssW / vp1.width, vp = page.getViewport({ scale });
      d.style.width = vp.width + 'px'; d.style.height = vp.height + 'px';
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const c = document.createElement('canvas'); c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr);
      c.style.width = vp.width + 'px'; c.style.height = vp.height + 'px';
      d.appendChild(c);
      st.task = page.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
      await st.task.promise;
      if (this.pages.get(p) !== st) return;
      const tl = document.createElement('div'); tl.className = 'textLayer';
      tl.style.width = vp.width + 'px'; tl.style.height = vp.height + 'px';
      d.style.setProperty('--scale-factor', scale);
      d.appendChild(tl);
      const tc = await page.getTextContent();
      this.textCache.set(p, tc);
      await pdfjsLib.renderTextLayer({ textContentSource: tc, container: tl, viewport: vp, textDivs: [] }).promise;
      const eoc = document.createElement('div'); eoc.className = 'endOfContent'; tl.appendChild(eoc);
      tl.addEventListener('pointerdown', () => eoc.classList.add('active'));
      this.onTextLayer?.(d, p);
    } catch (e) { if (e?.name !== 'RenderingCancelledException') console.warn('render', p, e); }
  }

  async pageText(p) {
    let tc = this.textCache.get(p);
    if (!tc) { const page = await this.doc.getPage(p); tc = await page.getTextContent(); this.textCache.set(p, tc); }
    let s = '';
    for (const it of tc.items) { if (!('str' in it)) continue; s += it.str; s += it.hasEOL ? '\n' : ''; }
    return clean(s);
  }
  async rangeText(a, b, max = 14000) {
    let out = '';
    for (let p = a; p <= b && out.length < max; p++) out += `\n[page ${p}]\n` + await this.pageText(p);
    return out.slice(0, max);
  }

  bindPointer() {
    let downAt = null;
    this.el.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY }; });
    document.addEventListener('pointerup', () => this.el.querySelectorAll('.endOfContent.active').forEach(x => x.classList.remove('active')));
    this.el.addEventListener('pointerup', e => {
      const moved = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6;
      setTimeout(() => {
        const sel = window.getSelection();
        const txt = sel && !sel.isCollapsed ? clean(sel.toString()) : '';
        const pageEl = e.target.closest?.('.pdfpage');
        const p = pageEl ? +pageEl.dataset.p : this.current;
        if (txt && (moved || txt.split(/\s+/).length > 1)) {
          if (txt.split(/\s+/).length === 1 && /^[A-Za-z][A-Za-z'’-]*$/.test(txt)) { this.onWord?.({ word: txt, sentence: '', page: p }); return; }
          const r = sel.getRangeAt(0).getBoundingClientRect();
          this.onSelect?.({ text: txt, page: p, rect: r });
          return;
        }
        if (moved) return;
        const span = e.target.closest?.('.textLayer span');
        if (!span) return;
        const hit = wordAt(e.clientX, e.clientY, span);
        if (hit) {
          this.highlight(pageEl, hit.range);
          this.onWord?.({ word: hit.word, sentence: sentenceAround(span, hit), page: p });
        }
      }, 10);
    });
  }

  highlight(pageEl, range) {
    pageEl.querySelectorAll('.word-hl').forEach(x => x.remove());
    if (!range) return;
    const pr = pageEl.getBoundingClientRect();
    for (const r of range.getClientRects()) {
      const h = document.createElement('div'); h.className = 'word-hl';
      Object.assign(h.style, { left: (r.left - pr.left - 1) + 'px', top: (r.top - pr.top - 1) + 'px', width: (r.width + 2) + 'px', height: (r.height + 2) + 'px' });
      pageEl.appendChild(h);
    }
  }
}

// Mark occurrences of terms (array of lowercase strings / RegExp) on a rendered page
export function markTerms(pageEl, re, cls) {
  pageEl.querySelectorAll('.' + cls).forEach(x => x.remove());
  if (!re) return 0;
  const pr = pageEl.getBoundingClientRect(); let n = 0;
  pageEl.querySelectorAll('.textLayer span').forEach(sp => {
    const tn = sp.firstChild; if (!tn || tn.nodeType !== 3) return;
    re.lastIndex = 0; let m;
    while ((m = re.exec(tn.textContent))) {
      if (!m[0]) { re.lastIndex++; continue; }
      const r = document.createRange(); r.setStart(tn, m.index); r.setEnd(tn, m.index + m[0].length);
      for (const rc of r.getClientRects()) {
        const h = document.createElement('div'); h.className = cls;
        Object.assign(h.style, { left: (rc.left - pr.left) + 'px', top: (rc.top - pr.top) + 'px', width: rc.width + 'px', height: rc.height + 'px' });
        pageEl.appendChild(h); n++;
      }
    }
  });
  return n;
}

export function clean(s) {
  return s.replace(/­\s*/g, '').replace(/([a-z])-\n([a-z])/g, '$1$2').replace(/[ \t]*\n[ \t]*/g, ' ').replace(/\s{2,}/g, ' ').replace(/[  ]/g, ' ').trim();
}

const WCH = /[A-Za-z'’\-­]/;
function caretAt(x, y) {
  if (document.caretPositionFromPoint) { const c = document.caretPositionFromPoint(x, y); return c && { node: c.offsetNode, off: c.offset }; }
  if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; }
  return null;
}
function wordAt(x, y, span) {
  const c = caretAt(x, y); if (!c || c.node.nodeType !== 3) return null;
  const t = c.node.textContent; let a = c.off, b = c.off;
  if (a > 0 && !WCH.test(t[a] || '') && WCH.test(t[a - 1])) { a--; b--; }
  while (a > 0 && WCH.test(t[a - 1])) a--;
  while (b < t.length && WCH.test(t[b])) b++;
  let word = t.slice(a, b).replace(/­/g, '').replace(/^[-'’]+|[-'’]+$/g, '');
  if (!word || !/[A-Za-z]/.test(word)) return null;
  // join word hyphenated across line end
  if (b >= t.length && /[-­]$/.test(t.slice(a, b))) {
    const next = span.nextElementSibling?.tagName === 'BR' ? span.nextElementSibling.nextElementSibling : span.nextElementSibling;
    const m = next?.textContent.match(/^[A-Za-z]+/); if (m) word = word.replace(/-$/, '') + m[0];
  }
  const range = document.createRange(); range.setStart(c.node, a); range.setEnd(c.node, b);
  return { word, range, a, node: c.node };
}
function sentenceAround(span, hit) {
  const sibs = [...span.parentElement.querySelectorAll('span:not(.markedContent)')].filter(s => s.childNodes.length && s.firstChild.nodeType === 3);
  const i = sibs.indexOf(span); if (i < 0) return '';
  const from = Math.max(0, i - 6), to = Math.min(sibs.length, i + 7);
  let before = '', after = '';
  for (let k = from; k < i; k++) before += sibs[k].textContent + ' ';
  before += span.textContent.slice(0, hit.a);
  after = span.textContent.slice(hit.a);
  for (let k = i + 1; k < to; k++) after += ' ' + sibs[k].textContent;
  before = before.replace(/\s+/g, ' '); after = after.replace(/\s+/g, ' ');
  const s0 = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! '));
  const sb = s0 >= 0 ? before.slice(s0 + 2) : before;
  const m = after.match(/^.*?[.?!](?=\s|$)/);
  return clean((sb + (m ? m[0] : after)).replace(/([a-z])[-\u00ad]\s+([a-z])/g, '$1$2')).slice(0, 400);
}
