/* 회계감사기준 문단 검색 (kb.js)
   문단 지식베이스는 저장소에 없다 — 자료/kb/ksa.db (tools/kb_build.py → tools/kb_db.js. 저작권 때문에 .gitignore)

     node tools/kb.js find 조회서 발송 거부 [--k=5] [--std=505] [--plain]    문단 검색 (BM25)
     node tools/kb.js grep 적극적 조회 [--k=20]                             문구 그대로 찾기 (전문 색인)
     node tools/kb.js show 505-8                                           한 문단 전부
     node tools/kb.js eval [--miss]                                        검색 품질 측정
     node tools/kb.js check                                                문단 번호 무결성 점검
     node tools/kb.js stats                                                지식베이스 규모
     node tools/kb.js node par:505-8 | con:감사증거 | 적극적 조회              그래프 노드 하나와 연결 (이름 일부로도)
     node tools/kb.js graph                                                그래프 규모 · 관계별 엣지 수

   불러오기 · 색인 · 검색은 tools/kb-core.js — 채점 서버도 같은 것을 쓴다.
   측정: 정답을 사람이 새로 만들지 않는다. 기출 · GS 문항에 달린 기준서(자료/db/items.jsonl)와
         해설에 인쇄된 문단 번호(자료/ocr, 자료/gs_review)를 그대로 정답으로 쓴다.
*/
const fs = require('fs'), path = require('path');
const core = require('./kb-core');
const ROOT = path.join(__dirname, '..');

const KB = core.load();
if (!KB) {
  console.log('지식베이스가 없습니다: 자료/kb/ksa.db');
  console.log('python -I tools/kb_build.py "<회계감사기준 전문 .docx>" 로 문단을 뽑고 node tools/kb_db.js 로 DB 를 만드세요');
  process.exit(0);
}
const { docs, byId, search, plainHeading, norm } = KB;

const args = process.argv.slice(2);
const opts = {};
const words = args.filter(a => {
  const m = /^--(\w+)(?:=(.*))?$/.exec(a);
  if (m) { opts[m[1]] = m[2] === undefined ? true : m[2]; return false; }
  return true;
});

/* ── 측정 ─────────────────────────────────── */
// 해설에 인쇄된 문단 번호 — tools/kb-core.js
const citations = () => core.citations(byId);

function metric(rows, hit, ks, onMiss) {
  const res = {};
  ks.forEach(k => { res[k] = 0; });
  let rr = 0;
  rows.forEach(r => {
    const top = search(r.query, { k: Math.max.apply(null, ks.concat(50)), plain: r.plain });
    const rank = top.findIndex(([, d]) => hit(r, d));
    if (onMiss && (rank < 0 || rank >= 5)) onMiss(r, top);
    if (rank >= 0) rr += 1 / (rank + 1);
    ks.forEach(k => { if (rank >= 0 && rank < k) res[k]++; });
  });
  return { res, mrr: rr / Math.max(rows.length, 1), n: rows.length };
}
const pct = (a, b) => (100 * a / Math.max(b, 1)).toFixed(1).padStart(5) + '%';

// 설정은 개발 세트로만 골랐다 — 검증 세트의 숫자가 실제 성능이다
const hash = t => { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const isDev = r => hash(r.key) % 2 === 0;

function evaluate() {
  const ks = [1, 3, 5, 10];
  const print = (name, m) => console.log(`  ${name.padEnd(18)} ${String(m.n).padStart(4)}건  ` +
    ks.map(k => `@${k} ${pct(m.res[k], m.n)}`).join('  ') + `  MRR ${m.mrr.toFixed(3)}`);
  const report = (rows, hit, extra) => {
    print('개발 세트', metric(rows.filter(isDev), hit, ks));
    print('검증 세트', metric(rows.filter(r => !isDev(r)), hit, ks));
    print('검증 · 사전 없이', metric(rows.filter(r => !isDev(r)).map(r => Object.assign({ plain: true }, r)), hit, ks));
    if (extra) print(extra[0] + ' (검증)', metric(rows.filter(r => !isDev(r)), extra[1], ks));
  };

  const itemFile = path.join(ROOT, '자료', 'db', 'items.jsonl');
  const items = fs.existsSync(itemFile) ? fs.readFileSync(itemFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const withStd = items.map(x => ({
    key: x.id,
    gold: (x.ksa || []).filter(s => /^\d{3,4}$/.test(s)),
    query: [x.topic, x.ask, (x.points || []).join(' ')].join(' ')
  })).filter(x => x.gold.length);
  console.log('■ 기준서 단위 — 기출 · GS 문항에 달린 기준서가 결과에 있는가');
  report(withStd, (r, d) => r.gold.indexOf(d.std) >= 0);

  const cited = citations();
  console.log('■ 문단 단위 — 해설에 인쇄된 문단 번호가 결과에 있는가');
  report(cited, (r, d) => d.id === r.id, ['같은 절까지', (r, d) => d.id === r.id || (d.std === byId[r.id].std && d.heading === byId[r.id].heading)]);

  if (opts.miss) {
    console.log('■ 문단 단위 — 5위 안에 못 든 인용');
    metric(cited, (r, d) => d.id === r.id, ks, (r, top) => console.log(`  ${r.id.padEnd(9)} ← ${top.slice(0, 2).map(([, d]) => d.id).join(' ')} | ${norm(r.query).slice(0, 60)}`));
  }
  console.log(`■ 색인 — 문단 ${KB.stats.paragraphs} · 단위 ${KB.stats.units} · 두 글자 ${KB.stats.grams} · 사전 묶음 ${KB.stats.lexicon} · 읽은 곳 ${KB.source}`);
}

/* ── 번호 무결성 ─────────────────────────── */
// 요구사항 N 이 '(문단 A5 참조)' 로 가리킨 적용지침 A5 의 제목이 '(문단 N 참조)' 로 되돌아 가리키는가.
// Word 자동 번호를 되살린 것이라 어긋나면 기준서 전체가 밀린다. 한 요구사항이 여러 절을 가리키는 경우가 있어 100% 는 아니다
function nums(t) {
  const out = [];
  String(t).replace(/\([a-z]+\)/g, '').split(/[,，]/).forEach(p => {
    const r = /A?(\d+)\s*[-–~]\s*A?(\d+)/.exec(p);
    if (r) { for (let i = +r[1]; i <= +r[2] && i - +r[1] < 200; i++) out.push(i); return; }
    const n = /A?(\d+)/.exec(p);
    if (n) out.push(+n[1]);
  });
  return out;
}
function check() {
  let total = 0, ok = 0;
  const off = {};
  docs.filter(d => /^\d+$/.test(d.no)).forEach(d => {
    const whole = d.text + ' ' + d.items.join(' ');
    const re = /\(문단\s*(A[\dA\s,，\-–~]+?)\s*참조\)/g;
    let m;
    while ((m = re.exec(whole))) {
      nums(m[1]).forEach(a => {
        const app = byId[d.std + '-A' + a];
        const h = app && /\(문단\s*([\d\s,，\-–~()a-z]+?)\s*참조\)/.exec(app.heading);
        if (!h) return;
        total++;
        if (nums(h[1]).indexOf(+d.no) >= 0) ok++;
        else (off[d.std] = off[d.std] || []).push(`${d.no}→A${a}(제목은 ${h[1].trim()})`);
      });
    }
  });
  console.log(`상호 인용 ${total}건 · 일치 ${ok}건 (${pct(ok, total).trim()})`);
  Object.keys(off).forEach(std => console.log(`  ${std.padEnd(5)} ${String(off[std].length).padStart(3)}건  ${off[std].slice(0, 3).join(' ')}`));
}

/* ── 명령 ─────────────────────────────────── */
const cmd = words.shift();

if (cmd === 'find') {
  search(words.join(' '), { k: +opts.k || 5, std: opts.std, plain: opts.plain }).forEach(([s, d]) => {
    console.log(`${d.id.padEnd(10)} ${s.toFixed(1).padStart(6)}  [${plainHeading(d).slice(0, 20)}] ${d.text.slice(0, 70)}`);
  });
} else if (cmd === 'show') {
  const d = byId[words[0]];
  if (!d) console.log('없는 문단:', words[0]);
  else {
    console.log(`■ ${d.id}  감사기준서 ${d.std} ${d.title}  (${d.kind})`);
    console.log(`  ${d.heading}`);
    console.log(d.text);
    d.items.forEach(t => console.log('  ' + t));
  }
} else if (cmd === 'grep') {
  const hits = KB.phrase(words.join(' '), { k: +opts.k || 20 });
  if (hits === null) console.log('문구 찾기는 DB 가 있어야 됩니다 — node tools/kb_db.js');
  else if (!hits.length) console.log('없음');
  else hits.forEach(h => console.log(`${h.id.padEnd(10)} ${h.snip.replace(/\s+/g, ' ')}`));
} else if (cmd === 'node' || cmd === 'graph') {
  const db = KB.db;
  const has = db && db.prepare("SELECT count(*) n FROM sqlite_master WHERE name = 'edge'").get().n && db.prepare('SELECT count(*) n FROM node').get().n;
  if (!has) console.log('그래프가 없습니다 — node tools/kb_graph.js');
  else if (cmd === 'graph') {
    console.log('■ 노드'); db.prepare('SELECT type, count(*) n FROM node GROUP BY type ORDER BY n DESC').all().forEach(r => console.log(`  ${r.type.padEnd(11)} ${String(r.n).padStart(6)}`));
    console.log('■ 엣지'); db.prepare('SELECT rel, source, count(*) n FROM edge GROUP BY rel, source ORDER BY rel, n DESC').all().forEach(r => console.log(`  ${r.rel.padEnd(12)} ${r.source.padEnd(12)} ${String(r.n).padStart(6)}`));
  } else {
    const q = words.join(' ');
    let n = db.prepare('SELECT * FROM node WHERE id = ?').get(q) || db.prepare('SELECT * FROM node WHERE id = ?').get('par:' + q) || db.prepare('SELECT * FROM node WHERE id = ?').get('con:' + q);
    if (!n) {
      const like = db.prepare("SELECT id, type, label FROM node WHERE label LIKE ? ORDER BY length(label) LIMIT 12").all('%' + q + '%');
      if (like.length === 1) n = db.prepare('SELECT * FROM node WHERE id = ?').get(like[0].id);
      else { console.log(like.length ? '여럿입니다 — id 로 다시:' : '없음'); like.forEach(r => console.log(`  ${r.id}  (${r.type}) ${r.label.slice(0, 50)}`)); }
    }
    if (n) {
      console.log(`■ ${n.id}  (${n.type})  ${n.label}`);
      if (n.attrs !== '{}') console.log('  ' + n.attrs.slice(0, 200));
      const show = (rows, arrow) => {
        const by = {};
        rows.forEach(r => { (by[r.rel + ' · ' + r.source] = by[r.rel + ' · ' + r.source] || []).push(r); });
        Object.keys(by).forEach(k => {
          const list = by[k].sort((a, b) => b.confidence - a.confidence || b.weight - a.weight);
          console.log(`  ${arrow} ${k} (${list.length})  ` + list.slice(0, 8).map(r => r.other + (r.confidence < 1 ? '·' + r.confidence.toFixed(2) : '') + (r.weight > 1 ? '×' + r.weight : '')).join('  '));
        });
      };
      show(db.prepare('SELECT rel, source, dst other, weight, confidence FROM edge WHERE src = ?').all(n.id), '→');
      show(db.prepare('SELECT rel, source, src other, weight, confidence FROM edge WHERE dst = ?').all(n.id), '←');
    }
  }
} else if (cmd === 'stats') {
  const s = KB.stats;
  console.log(`읽은 곳 ${KB.source} · 문단 ${s.paragraphs} · 색인 단위 ${s.units} · 두 글자 ${s.grams} · 사전 묶음 ${s.lexicon}`);
  if (KB.db) {
    const m = {};
    KB.db.prepare('SELECT key, value FROM meta').all().forEach(r => { m[r.key] = r.value; });
    const kinds = KB.db.prepare('SELECT kind, count(*) n FROM paragraph GROUP BY kind').all().map(r => r.kind + ' ' + r.n).join(' · ');
    const one = sql => KB.db.prepare(sql).get();
    const has = t => one(`SELECT count(*) n FROM sqlite_master WHERE type = 'table' AND name = '${t}'`).n > 0;
    console.log(`DB 스키마 ${one('PRAGMA user_version').user_version} · 만든 때 ${m.built_at} · 기준서 ${m.standards} · ${kinds}`);
    console.log(`점검 integrity_check ${one('PRAGMA integrity_check').integrity_check} · 외래키 위반 ${KB.db.prepare('PRAGMA foreign_key_check').all().length}`);
    if (has('node')) console.log(`그래프 노드 ${one('SELECT count(*) n FROM node').n} · 엣지 ${one('SELECT count(*) n FROM edge').n} (만든 때 ${m.graph_built_at || '-'}) · 검증된 논점 근거 ${one("SELECT count(*) n FROM edge WHERE rel = 'grounded_in' AND source = 'verified'").n} (만든 때 ${m.links_built_at || '-'})`);
    if (has('vector')) console.log('벡터 ' + (KB.db.prepare('SELECT model, count(*) n FROM vector GROUP BY model').all().map(r => `${r.model} ${r.n}${m['vector_' + r.model] ? '' : ' (만드는 중)'}`).join(' · ') || '없음') + ` · 색인 단위 ${s.units}`);
    if (has('grading_log')) console.log(`채점 기록 ${one('SELECT count(*) n FROM grading_log').n}건 (근거 붙임 ${one('SELECT count(*) n FROM grading_log WHERE rag = 1').n})`);
  }
} else if (cmd === 'eval') {
  evaluate();
} else if (cmd === 'check') {
  check();
} else {
  console.log('node tools/kb.js find <질의> | grep <문구> | show <문단> | node <노드> | graph | eval | check | stats');
}
