/* 이 PC 의 Claude Code 를 한 번 실행해 채점 판정을 받아 온다 (claude-run.mjs)
   tools/serve.mjs (게임의 /api/grade) 와 tools/aigrade-calib.mjs (모델 사이 일치 점검) 가 같이 쓴다.
   API 키를 쓰지 않는다 — 로그인해 둔 계정의 사용량으로 돈다 (`node tools/serve.mjs --login`).
   Claude Code 를 다른 곳에 깔았으면 환경변수 CLAUDE_BIN 에 실행 파일(또는 cli.js) 경로를 적는다 */
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

/* ── Claude Code 찾기 ──────────────────────────────────────
   CLAUDE_BIN → 데스크톱 앱이 받아 둔 것 중 가장 새 판 → PATH 의 claude */
const WIN = process.platform === 'win32';
function newestFirst(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (y[i] || 0) - (x[i] || 0); if (d) return d; }
  return 0;
}
const dirs = d => { try { return readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch (e) { return []; } };
export function findClaude() {
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

/* 실행 파일과 인자 — CLAUDE_BIN 이 스크립트(cli.js)면 node 로 돌린다 */
export function command(bin, args) {
  const viaNode = /\.[cm]?js$/i.test(bin);
  return [viaNode ? process.execPath : bin, viaNode ? [bin].concat(args) : args];
}

/* 한 번 실행하고 표준 출력을 모은다. 셸을 거치지 않는다 — 인자는 그대로 넘어간다 */
export function run(bin, args, input, ms) {
  return new Promise(resolve => {
    let out = '', err = '', done = false;
    const [file, argv] = command(bin, args);
    const child = spawn(file, argv, { cwd: os.tmpdir(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
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
export async function loggedIn(bin, fresh) {
  if (!fresh && Date.now() - auth.at < 20000) return auth.loggedIn;
  const r = await run(bin, ['auth', 'status'], '', 15000);
  const j = parse(r.out);
  auth = { at: Date.now(), loggedIn: !!(j && j.loggedIn) };
  return auth.loggedIn;
}

/* 채점 한 건 — body { system, user, schema, model }. 도구 없이, 구조화 출력으로, 대화 기록을 남기지 않고 한 번 묻는다.
   { ok: true, out } 또는 { ok: false, error: 'bin' | 'busy' | 'timeout' | 'login' | 'fail', detail } */
let busy = 0;
export async function gradeOnce(body, opt = {}) {
  const bin = findClaude();
  if (!bin) return { ok: false, error: 'bin' };
  if (busy >= (opt.max || 2)) return { ok: false, error: 'busy' };
  busy++;
  try {
    const args = ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(body.schema),
      '--system-prompt', String(body.system), '--model', String(body.model), '--effort', 'low',
      '--tools', '', '--strict-mcp-config', '--no-session-persistence'];
    const r = await run(bin, args, String(body.user), opt.ms || 60000);
    if (r.timeout) return { ok: false, error: 'timeout' };
    if (r.failed) return { ok: false, error: 'fail', detail: r.failed };
    // 결과는 JSON 한 덩어리 — 앞에 다른 줄이 섞여 나오면 마지막 줄을 읽는다
    const j = parse(r.out) || parse(r.out.trim().split(/\r?\n/).pop() || '');
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
