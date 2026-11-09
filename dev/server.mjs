// Local dev server: static files + /api/ai (MOCK=1 returns fake AI answers)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import handler from '../api/ai.js';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/ai')) {
    let body = ''; for await (const c of req) body += c;
    if (process.env.MOCK) {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET') return res.end(JSON.stringify({ ok: true, providers: ['mock'] }));
      const b = JSON.parse(body);
      const data = b.task === 'word' ? { headword: b.payload.word, pos: 'noun', ipa_uk: '/mɒk/', ipa_us: '/mɑːk/', vi: 'nghĩa giả lập', meaning_in_context: 'Giải thích ngữ cảnh: ' + b.payload.sentence, examples: [{ en: 'Example.', vi: 'Ví dụ.' }], collocations: ['a b'] }
        : b.task === 'passage' ? { translation: 'Bản dịch giả lập', meaning: 'Ý nghĩa', grammar: [{ segment: b.payload.text.slice(0, 30), analysis: 'Phân tích' }], vocab: [{ term: 'term', ipa: '/t/', vi: 'thuật ngữ' }] }
        : b.task === 'quiz' ? { questions: [{ q: 'Câu hỏi AI?', o: ['A', 'B', 'C', 'D'], a: 1, e: 'Giải thích' }] } : null;
      return res.end(JSON.stringify(data ? { data, model: 'mock' } : { text: '## Bài học\n- điểm 1\n- **điểm 2**', model: 'mock' }));
    }
    const shim = { statusCode: 200, headers: {}, setHeader(k, v) { res.setHeader(k, v); }, status(c) { this.statusCode = c; return this; }, json(o) { res.writeHead(this.statusCode, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); } };
    req.body = body; return handler(req, shim);
  }
  let f = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
