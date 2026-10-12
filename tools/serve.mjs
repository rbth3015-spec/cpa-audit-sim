/* 감사 시즌 2026 — 로컬에서 띄우기 (serve.mjs)
   실행:  node tools/serve.mjs            (http://localhost:8765)
          node tools/serve.mjs . 8080     폴더와 포트를 바꿀 때
   python -m http.server 는 동시 연결이 몰리면 끊겨 파일이 빠진다 — 그래서 이 파일을 쓴다

   AI 연동 채점 (js/aigrade.js 의 「이 PC」 길) — 이 서버로 띄웠을 때만 있다
     GET  /api/grade   { ok, bin, loggedIn }
     POST /api/grade   { system, user, schema, model } → 이 PC 의 Claude Code 로 한 번 묻고 { ok, out } 으로 답한다
   API 키를 쓰지 않는다. `node tools/serve.mjs --login` 으로 한 번 로그인해 둔 계정의 사용량으로 돈다.
   같은 출처(이 서버가 준 페이지)에서 온 요청만 받는다 — 다른 웹페이지가 내 사용량을 쓰지 못하게.
   Claude Code 를 다른 곳에 깔았으면 환경변수 CLAUDE_BIN 에 실행 파일 경로를 적는다 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const LOGIN = process.argv[2] === '--login';
const ROOT = path.resolve((!LOGIN && process.argv[2]) || process.cwd());   // 저장소 폴더에서 실행한다 — '.' 같은 상대 경로도 절대 경로로
const PORT = +(process.argv[3] || 8765);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

/* ── Claude Code 찾기 ──────────────────────────────────────
   CLAUDE_BIN → 데스크톱 앱이 받아 둔 것 중 가장 새 판 → PATH 의 claude */
const WIN = process.platform === 'win32';
function newestFirst(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (y[i] || 0) - (x[i] || 0); if (d) return d; }
  return 0;
}
const dirs = d => { try { return readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch (e) { return []; } };
function findClaude() {
  const env = process.env.CLAUDE_BIN;
  if (env && existsSync(env)) return env;
  const exe = WIN ? 'claude.exe' : 'claude';
  const roots = [];
  if (process.env.APPDATA) roots.push(path.join(process.env.APPDATA, 'Claude', 'claude-code'));
  roots.push(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code'));
  for (const root of roots) {
    for (const ver of dirs(root).filter(v => /^\d+(\.\d+)+$/.test(v)).sort(newestFirst)) {
      const direct = path.join(root, ver, exe);
      if (existsSync(direct)) return direct;
      for (const sub of dirs(path.join(root, ver))) {
        const f = path.join(root, ver, sub, exe);
        if (existsSync(f)) return f;
      }
    }
  }
  for (const d of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const f = path.join(d, exe);
    if (existsSync(f)) return f;
  }
  return null;
}

/* 한 번 실행하고 표준 출력을 모은다. 셸을 거치지 않는다 — 인자는 그대로 넘어간다 */
function run(bin, args, input, ms) {
  return new Promise(resolve => {
    let out = '', err = '', done = false;
    const viaNode = /\.[cm]?js$/i.test(bin);     // CLAUDE_BIN 이 스크립트(cli.js)면 node 로 돌린다
    const child = spawn(viaNode ? process.execPath : bin, viaNode ? [bin].concat(args) : args,
      { cwd: os.tmpdir(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const finish = r => { if (!done) { done = true; clearTimeout(timer); resolve(Object.assign({ out, err }, r)); } };
    const timer = setTimeout(() => { try { child.kill(); } catch (e) { /* 이미 끝남 */ } finish({ timeout: true }); }, ms);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => finish({ failed: e.message }));
    child.on('close', code => finish({ code }));
    child.stdin.on('error', () => { /* 바로 끝난 경우 */ });
    child.stdin.end(input || '');
  });
}
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };

let auth = { at: 0, loggedIn: false };
async function loggedIn(bin, fresh) {
  if (!fresh && Date.now() - auth.at < 20000) return auth.loggedIn;
  const r = await run(bin, ['auth', 'status'], '', 15000);
  const j = parse(r.out);
  auth = { at: Date.now(), loggedIn: !!(j && j.loggedIn) };
  return auth.loggedIn;
}

let busy = 0;
async function gradeOnce(body) {
  const bin = findClaude();
  if (!bin) return { ok: false, error: 'bin' };
  if (busy >= 2) return { ok: false, error: 'busy' };
  busy++;
  try {
    const args = ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(body.schema),
      '--system-prompt', String(body.system), '--model', String(body.model), '--effort', 'low',
      '--tools', '', '--strict-mcp-config', '--no-session-persistence'];
    const r = await run(bin, args, String(body.user), 60000);
    if (r.timeout) return { ok: false, error: 'timeout' };
    if (r.failed) return { ok: false, error: 'fail', detail: r.failed };
    const j = parse(r.out);
    if (!j) return { ok: false, error: 'fail', detail: (r.err || r.out || '').slice(0, 300) };
    if (j.is_error) {
      const text = String(j.result || '');
      if (/not logged in|\/login/i.test(text)) { auth = { at: Date.now(), loggedIn: false }; return { ok: false, error: 'login' }; }
      return { ok: false, error: 'fail', detail: text.slice(0, 300) };
    }
    // 구조화 출력은 structured_output 에, 없으면 result 글에서 JSON 을 읽는다
    let out = j.structured_output && typeof j.structured_output === 'object' ? j.structured_output : null;
    if (!out) out = parse(String(j.result || '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
    if (!out) return { ok: false, error: 'fail', detail: 'JSON 아님' };
    return { ok: true, out };
  } finally { busy--; }
}

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
const MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
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
  if (!body || typeof body.system !== 'string' || typeof body.user !== 'string' || !body.schema || typeof body.schema !== 'object' || !MODELS.has(body.model))
    return send(400, { ok: false, error: 'fail', detail: 'bad request' });
  send(200, await gradeOnce(body));
}

/* node tools/serve.mjs --login — 이 PC 의 Claude Code 로그인을 이 터미널에서 띄운다 (브라우저가 열린다) */
if (LOGIN) {
  const bin = findClaude();
  if (!bin) { console.log('Claude Code 를 찾지 못했습니다. 환경변수 CLAUDE_BIN 에 실행 파일 경로를 적어 주세요.'); process.exit(1); }
  const viaNode = /\.[cm]?js$/i.test(bin);
  const child = spawn(viaNode ? process.execPath : bin, (viaNode ? [bin] : []).concat(['auth', 'login']), { stdio: 'inherit' });
  child.on('close', code => process.exit(code || 0));
} else http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/api/grade') return await api(req, res);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const buf = await readFile(f);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  } catch (e) { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
}).listen(PORT, '127.0.0.1', 1024, () => console.log('serving', ROOT, PORT));
