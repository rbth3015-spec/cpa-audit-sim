/* 지식베이스 전체 다시 만들기 (kb-rebuild.mjs)

     node tools/kb-rebuild.mjs            문단 DB → 지식그래프 → 벡터(바뀐 것만) → 논점 근거 연결
     node tools/kb-rebuild.mjs --docx "<회계감사기준 전문 .docx>"   원문부터 (tools/kb_build.py 를 먼저)

   단계마다 앞 단계가 끝나야 다음으로 간다. 벡터는 글이 같으면 다시 계산하지 않는다.
*/
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const docx = args.indexOf('--docx') >= 0 ? args[args.indexOf('--docx') + 1] : null;

const steps = [];
if (docx) steps.push(['원문 → 문단', 'python', ['-I', 'tools/kb_build.py', docx]]);
steps.push(['문단 → DB', process.execPath, ['tools/kb_db.js']]);
steps.push(['지식그래프', process.execPath, ['tools/kb_graph.js']]);
steps.push(['벡터 e5-small', process.execPath, ['tools/kb-embed.mjs', 'build', '--model=e5-small']]);
steps.push(['벡터 e5-base', process.execPath, ['tools/kb-embed.mjs', 'build', '--model=e5-base']]);
steps.push(['논점 근거 연결', process.execPath, ['tools/kb-link.mjs']]);

for (const [name, cmd, argv] of steps) {
  console.log(`\n■ ${name}`);
  const t0 = Date.now();
  const r = spawnSync(cmd, argv, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) { console.log(`  ✕ ${name} 실패 (코드 ${r.status}) — 여기서 멈춘다`); process.exit(1); }
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)}초`);
}
