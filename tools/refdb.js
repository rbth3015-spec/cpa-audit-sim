/* 기출·GS 참고 DB 조회 (refdb.js)
   DB 자체는 저장소에 없다 — 자료/db/items.jsonl (저작권 때문에 .gitignore)

     node tools/refdb.js                통계
     node tools/refdb.js find 특수관계자   검색 (상황 · 논점 · 함정까지)
     node tools/refdb.js ksa 540        기준서로
     node tools/refdb.js area 실증절차     분야로
     node tools/refdb.js form 적부판단표    형태로
     node tools/refdb.js new [n] [거르기]  아직 게임에 안 쓴 논점 n개 (거르기: 출처 · 분야 · 기준서 · 논점 글자 — 예: new 5 IT)
     node tools/refdb.js set HS2        출처(세트)로
     node tools/refdb.js show K26-2-4   한 줄 전부
*/
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', '자료', 'db', 'items.jsonl');

if (!fs.existsSync(FILE)) {
  console.log('DB 가 없습니다: 자료/db/items.jsonl');
  console.log('(자료 폴더는 저작권 때문에 저장소에 올리지 않습니다)');
  process.exit(0);
}
const items = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l, i) => {
  try { return JSON.parse(l); } catch (e) { console.log(`  ✕ ${i + 1}번째 줄 JSON 오류`); return null; }
}).filter(Boolean);

const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.join(' ');
const line = x => `${x.id.padEnd(9)} ${(x.area || '').padEnd(10)} ${x.topic}`;

function show(x) {
  console.log(`\n■ ${x.id}  ${x.src}`);
  console.log(`  분야 ${x.area} · 기준서 ${(x.ksa || []).join(' ')} · 형태 ${x.form}${x.limit ? ' (' + x.limit + ')' : ''}`);
  console.log(`  묻는 말: ${x.ask}`);
  if (x.setting) console.log(`  상황: ${x.setting}`);
  (x.points || []).forEach(p => console.log(`   · ${p}`));
  (x.traps || []).forEach(p => console.log(`   ! ${p}`));
  if (x.note) console.log(`  메모: ${x.note}`);
  console.log(`  게임: ${(x.fit || []).join(' · ') || '-'}${(x.used || []).length ? '  이미 씀 → ' + x.used.join(', ') : '  아직 안 씀'}`);
}

function tally(key, get) {
  const t = {};
  items.forEach(x => [].concat(get(x) || []).forEach(v => { t[v] = (t[v] || 0) + 1; }));
  console.log(`\n${key}`);
  Object.entries(t).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`));
}

if (!cmd) {
  const used = items.filter(x => (x.used || []).length).length;
  console.log(`물음 ${items.length}개 · 게임에 옮긴 것 ${used} · 남은 것 ${items.length - used}`);
  tally('분야', x => x.area);
  tally('기준서', x => x.ksa);
  tally('형태', x => x.form);
  tally('출처', x => x.set);
} else if (cmd === 'show') {
  const x = items.find(i => i.id.toLowerCase() === arg.toLowerCase());
  if (x) show(x); else console.log('없는 id');
} else if (cmd === 'new') {
  const n = parseInt(rest[0], 10) || 5;
  const q = rest.slice(parseInt(rest[0], 10) ? 1 : 0).join(' ').toLowerCase();
  const hit = x => !q || [x.set, x.area, x.topic, (x.ksa || []).join(' ')].join(' ').toLowerCase().includes(q);
  const left = items.filter(x => !(x.used || []).length && hit(x));
  console.log(`아직 안 쓴 논점${q ? ' · "' + q + '"' : ''} ${left.length}개 중 ${Math.min(n, left.length)}개`);
  left.slice(0, n).forEach(show);
} else if (['ksa', 'area', 'form', 'set'].includes(cmd)) {
  const hit = items.filter(x => [].concat(x[cmd] || []).some(v => String(v).includes(arg)));
  console.log(`${cmd} "${arg}" — ${hit.length}개`);
  hit.forEach(x => console.log('  ' + line(x)));
} else {
  const q = (cmd === 'find' ? arg : [cmd, ...rest].join(' ')).toLowerCase();
  const hit = items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
  console.log(`"${q}" — ${hit.length}개`);
  hit.forEach(show);
}
