/* 감사 시즌 2026 — 로컬에서 띄우기 (serve.mjs)
   실행:  node tools/serve.mjs            (http://localhost:8765)
          node tools/serve.mjs . 8080     폴더와 포트를 바꿀 때
          node tools/serve.mjs --login    이 PC 의 Claude Code 로그인 (AI 연동 채점용 · 브라우저가 열린다)
   python -m http.server 는 동시 연결이 몰리면 끊겨 파일이 빠진다 — 그래서 이 파일을 쓴다

   AI 연동 채점 (js/aigrade.js 의 「이 PC」 길) — 이 서버로 띄웠을 때만 있다
     GET  /api/grade   { ok, bin, loggedIn }
     POST /api/grade   { system, user, schema, model, ground? } → 이 PC 의 Claude Code 로 한 번 묻고 { ok, out, ground } 으로 답한다
                       ground { q, stds } 가 오면 기준서 지식베이스에서 근거 문단을 찾아 요청 글에 붙인다 (RAG, tools/kb-ground.mjs)
     GET  /api/kb/*    그래프 탐색기(kb.html)용 읽기 API (tools/kb-api.mjs)
   API 키를 쓰지 않는다. `--login` 으로 한 번 로그인해 둔 계정의 사용량으로 돈다 (실행은 tools/claude-run.mjs).
   같은 출처(이 서버가 준 페이지)에서 온 요청만 받는다 — 다른 웹페이지가 내 사용량을 쓰지 못하게 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { MODELS, findClaude, command, loggedIn, gradeOnce } from './claude-run.mjs';

/* 기준서 지식베이스 — 자료/kb/ksa.db 가 있을 때만. 없으면 근거 없이 예전처럼 채점한다 */
let KBG = null, KBAPI = null;
async function kbModules() {
  if (KBG !== null) return KBG;
  try {
    KBG = await import('./kb-ground.mjs');
    KBAPI = await import('./kb-api.mjs');
    if (!KBG.available()) KBG = false;
  } catch (e) { KBG = false; }
  return KBG;
}
const LOGIN = process.argv[2] === '--login';
const ROOT = path.resolve((!LOGIN && process.argv[2]) || process.cwd());   // 저장소 폴더에서 실행한다 — '.' 같은 상대 경로도 절대 경로로
const PORT = +(process.argv[3] || 8765);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

/* 같은 출처에서 온 요청인가 — Host 는 이 서버여야 하고, Origin 이 있으면 이 서버여야 한다 */
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
function sameOrigin(req, needOrigin) {
  if (!HOSTS.has(String(req.headers.host || '').toLowerCase())) return false;
  const o = req.headers.origin;
  if (!o) return !needOrigin;
  try { return HOSTS.has(new URL(o).host.toLowerCase()); } catch (e) { return false; }
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function api(req, res) {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'GET') {
    if (!sameOrigin(req, false)) return send(403, { ok: false });
    const bin = findClaude();
    return send(200, { ok: true, bin: !!bin, loggedIn: bin ? await loggedIn(bin, true) : false });
  }
  if (req.method !== 'POST') return send(405, { ok: false });
  if (!sameOrigin(req, true) || !/^application\/json/i.test(req.headers['content-type'] || '')) return send(403, { ok: false });
  let body;
  try { body = JSON.parse(await readBody(req, 100000)); } catch (e) { return send(400, { ok: false, error: 'fail', detail: 'bad request' }); }
  if (!body || typeof body.system !== 'string' || typeof body.user !== 'string' || !body.schema || typeof body.schema !== 'object' || !MODELS.includes(body.model))
    return send(400, { ok: false, error: 'fail', detail: 'bad request' });
  // 근거 문단 — 물음 · 논점으로 찾아 요청 글 끝에 붙인다
  const want = body.ground && typeof body.ground === 'object' && typeof body.ground.q === 'string';
  const G = want ? await kbModules() : false;
  let g = null;
  if (G) { try { g = await G.ground(body.ground); } catch (e) { g = null; } }
  const t0 = Date.now();
  const r = await gradeOnce({ system: body.system, user: body.user + (g ? g.block : ''), schema: body.schema, model: body.model });
  if (g && r.ok) {
    G.keepCites(r.out, g.ids);
    r.ground = { ids: g.ids, paragraphs: g.paragraphs, mode: g.mode, ms: g.ms };
  }
  if (G) {
    const verdicts = {}, cited = {};
    ((r.ok && r.out && r.out.must) || []).forEach(m => { verdicts[m.id] = m.verdict; if (m.cite && m.cite.length) cited[m.id] = m.cite; });
    G.logGrade({ model: body.model, guide: +body.guide || 0, rag: !!g, question: body.ground.q, retrieved: g ? g.ids : [],
                 cited, verdicts, ok: r.ok, msRetrieve: g ? g.ms : 0, msGrade: Date.now() - t0 });
  }
  send(200, r);
}

/* node tools/serve.mjs --login — 이 PC 의 Claude Code 로그인을 이 터미널에서 띄운다 (브라우저가 열린다) */
if (LOGIN) {
  const bin = findClaude();
  if (!bin) { console.log('Claude Code 를 찾지 못했습니다. 환경변수 CLAUDE_BIN 에 실행 파일 경로를 적어 주세요.'); process.exit(1); }
  const [file, argv] = command(bin, ['auth', 'login']);
  const child = spawn(file, argv, { stdio: 'inherit' });
  child.on('close', code => process.exit(code || 0));
} else http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/api/grade') return await api(req, res);
    if (p.startsWith('/api/kb/')) {
      if (!sameOrigin(req, false)) { res.writeHead(403); return res.end(); }
      const G = await kbModules();
      const out = G ? await KBAPI.kbApi(req.url) : { code: 503, body: { ok: false, error: '지식베이스 없음' } };
      res.writeHead(out.code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(out.body));
    }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const buf = await readFile(f);
    const head = { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    // 음악 이어 듣기는 구간 요청이 있어야 위치를 옮길 수 있다
    const r = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (r && +r[1] < buf.length) {
      const from = +r[1], to = r[2] ? Math.min(+r[2], buf.length - 1) : buf.length - 1;
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${from}-${to}/${buf.length}` });
      return res.end(buf.subarray(from, to + 1));
    }
    res.writeHead(200, head);
    res.end(buf);
  } catch (e) { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
}).listen(PORT, '127.0.0.1', 1024, () => {
  console.log('serving', ROOT, PORT);
  // 첫 채점이 느리지 않게 — 지식베이스 · 임베딩 모델을 미리 읽어 둔다
  kbModules().then(G => G && G.ground({ q: '감사증거', stds: [] })).then(g => g && console.log('지식베이스 준비 — 근거 검색 ' + g.mode), () => {});
});
