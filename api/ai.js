// Vercel Serverless Function: /api/ai
// AI gateway with retries, model fallback and provider fallback.
// Env vars (Vercel → Project → Settings → Environment Variables):
//   ANTHROPIC_API_KEY   (khuyến nghị)  – key trả phí từ console.anthropic.com
//   AI_MODEL            (tuỳ chọn)     – mặc định claude-sonnet-5-5
//   AI_FALLBACK_MODEL   (tuỳ chọn)     – mặc định claude-haiku-5-5
//   GEMINI_API_KEY      (tuỳ chọn)     – nhà cung cấp dự phòng
//   GEMINI_MODEL        (tuỳ chọn)     – tên model Gemini dự phòng
//   APP_ACCESS_CODE     (khuyến nghị)  – mã truy cập để người lạ không dùng hết tiền API

const SYSTEM = `You are a bilingual (Vietnamese–English) tutor for a Vietnamese cardiologist who is learning medical English from the textbook "Case-based Comprehensive Cardiology" (Yeo & Poh, Springer 2026).
Rules:
- Explanations in Vietnamese; keep English medical terms where Vietnamese clinicians normally use them.
- Be accurate at guideline level (ESC, ACC/AHA, ASE). If unsure, say so. Never invent references.
- IPA must follow Cambridge Dictionary conventions (UK and US).
- When asked for JSON, output ONLY valid minified JSON, no markdown fences.`;

const TASKS = {
  word: (p) => ({
    json: true, max: 900,
    prompt: `Word clicked: "${p.word}"
Sentence from the book: "${p.sentence || ''}"
Return JSON with keys:
{"headword":string (dictionary form),"pos":string,"ipa_uk":string,"ipa_us":string,"stress_tip":string (Vietnamese tip on stressed syllable),
"vi":string (nghĩa tiếng Việt đúng trong NGỮ CẢNH câu trên),"definition_en":string (simple English),
"meaning_in_context":string (giải thích tiếng Việt từ này nghĩa gì trong câu này, 1-2 câu),
"medical_note":string (ghi chú lâm sàng liên quan, ngắn, có thể rỗng),
"collocations":[string] (3-5 cụm từ y khoa hay đi kèm),"word_family":[string],
"examples":[{"en":string,"vi":string}] (2 câu ví dụ lâm sàng tự nhiên),
"synonyms":[string],"confusables":string (từ dễ nhầm và cách phân biệt, có thể rỗng)}`
  }),
  passage: (p) => ({
    json: true, max: 2500,
    prompt: `Selected passage from the book (page ${p.page || '?'}):
"""${p.text}"""
Return JSON:
{"translation":string (dịch SÁT NGHĨA tiếng Việt, giữ cấu trúc câu),
"natural":string (dịch thoát ý, văn phong y khoa Việt Nam),
"meaning":string (ý chính & thông điệp lâm sàng của đoạn, tiếng Việt),
"grammar":[{"segment":string (trích nguyên văn),"analysis":string (phân tích ngữ pháp tiếng Việt: thì, mệnh đề, bị động, rút gọn, giới từ, ...)}],
"structures":[{"pattern":string (mẫu câu học thuật hữu ích),"use":string,"example":string}],
"vocab":[{"term":string,"ipa":string,"vi":string}] (5-10 từ/cụm quan trọng),
"clinical_check":string (kiểm tra với guideline hiện hành: còn đúng/đã cập nhật gì, ngắn gọn; nếu không liên quan để rỗng)}`
  }),
  quiz: (p) => ({
    json: true, max: 3000,
    prompt: `Create ${p.n || 5} multiple-choice questions in Vietnamese (keep English terms) from this textbook passage, mixing clinical reasoning and medical English vocabulary.
Passage:
"""${(p.text || '').slice(0, 14000)}"""
Return JSON: {"questions":[{"q":string,"o":[4 strings],"a":index 0-3,"e":string explanation}]}`
  }),
  lesson: (p) => ({
    json: false, max: 2200,
    prompt: `Đây là nội dung một case trong sách (chương ${p.chapter}, case ${p.case}):
"""${(p.text || '').slice(0, 14000)}"""
Hãy soạn bài học ngắn gọn bằng tiếng Việt (markdown):
1) Tóm tắt case & câu hỏi; 2) Đáp án và lập luận; 3) Bài học lâm sàng cốt lõi (đối chiếu guideline hiện hành, nêu cập nhật nếu có);
4) 8–12 từ/cụm từ tiếng Anh đáng học kèm IPA và nghĩa; 5) 3 mẫu câu tiếng Anh hữu ích để trình bày case khi giao ban.`
  }),
  chat: (p) => ({
    json: false, max: 1800,
    messages: p.messages,
    context: p.context
  }),
};

async function callAnthropic(model, system, messages, max, signal) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: max, system, messages })
  });
  if (!r.ok) { const e = new Error('anthropic ' + r.status + ' ' + (await r.text()).slice(0, 300)); e.status = r.status; e.retryAfter = +r.headers.get('retry-after') || 0; throw e; }
  const j = await r.json();
  return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}

async function callGemini(model, system, messages, max, signal) {
  const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: max } })
  });
  if (!r.ok) { const e = new Error('gemini ' + r.status + ' ' + (await r.text()).slice(0, 300)); e.status = r.status; throw e; }
  const j = await r.json();
  return j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function providers() {
  const list = [];
  if (process.env.ANTHROPIC_API_KEY) {
    const m1 = process.env.AI_MODEL || 'claude-sonnet-5-5';
    const m2 = process.env.AI_FALLBACK_MODEL || 'claude-haiku-5-5';
    list.push({ name: 'anthropic', model: m1, fn: callAnthropic });
    if (m2 && m2 !== m1) list.push({ name: 'anthropic', model: m2, fn: callAnthropic });
  }
  if (process.env.GEMINI_API_KEY) list.push({ name: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', fn: callGemini });
  return list;
}

async function runWithFallback(system, messages, max) {
  const errors = [];
  const deadline = Date.now() + 52000;
  for (const p of providers()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (Date.now() > deadline) break;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), Math.min(40000, deadline - Date.now()));
      try {
        const text = await p.fn(p.model, system, messages, max, ctrl.signal);
        clearTimeout(t);
        if (text) return { text, provider: p.name, model: p.model };
        throw new Error('empty response');
      } catch (e) {
        clearTimeout(t);
        errors.push(`${p.model}: ${e.message}`);
        const retryable = !e.status || RETRYABLE.has(e.status);
        if (!retryable) break;                      // 400/401/403: chuyển model/nhà cung cấp khác
        const wait = e.retryAfter ? e.retryAfter * 1000 : [700, 1800, 3500][attempt];
        await sleep(Math.min(wait, 6000));
      }
    }
  }
  const err = new Error(errors.join(' | ') || 'Chưa cấu hình API key');
  err.noProvider = providers().length === 0;
  throw err;
}

function parseJSON(text) {
  const s = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const ps = providers();
    return res.status(200).json({ ok: ps.length > 0, providers: ps.map(p => p.model), needsCode: !!process.env.APP_ACCESS_CODE });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.APP_ACCESS_CODE && req.headers['x-access-code'] !== process.env.APP_ACCESS_CODE)
    return res.status(401).json({ error: 'Sai hoặc thiếu mã truy cập (Cài đặt → Mã truy cập).' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const build = TASKS[body.task];
  if (!build) return res.status(400).json({ error: 'Unknown task' });
  const t = build(body.payload || {});

  let system = SYSTEM, messages;
  if (body.task === 'chat') {
    if (t.context) system += `\n\nCurrent study context (textbook pages the user is reading):\n"""${String(t.context).slice(0, 14000)}"""`;
    messages = (t.messages || []).slice(-16).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 6000) }));
  } else {
    messages = [{ role: 'user', content: t.prompt }];
  }

  try {
    const out = await runWithFallback(system, messages, t.max);
    if (t.json) {
      const data = parseJSON(out.text);
      if (!data) return res.status(502).json({ error: 'AI trả về sai định dạng, thử lại.', raw: out.text.slice(0, 500) });
      return res.status(200).json({ data, model: out.model });
    }
    return res.status(200).json({ text: out.text, model: out.model });
  } catch (e) {
    return res.status(e.noProvider ? 503 : 502).json({ error: e.noProvider ? 'AI chưa được cấu hình (thiếu API key trên Vercel).' : 'AI tạm thời không phản hồi sau nhiều lần thử: ' + e.message.slice(0, 400), noProvider: !!e.noProvider });
  }
}
