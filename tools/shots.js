/* 감사 시즌 2026 — 이미지 생산 (shots.js)
   실행:  node tools/shots.js          전부
          node tools/shots.js art      아트 대지만
   ------------------------------------------------------------
   이 저장소에는 래스터 도구가 없다 (PIL · ImageMagick · sharp 전부 없음).
   있는 것은 Chromium 하나뿐인데, 그걸로 할 수 있는 일이 셋이다.

     1. 렌더   HTML/CSS/SVG 를 임의 크기 PNG 로 찍는다        ← 이 파일
     2. 후처리 페이지 안 <canvas> 에서 크롭·리사이즈·흑백·재인코딩
               (사진이 들어오면 tools/plates.js 가 이걸 쓴다)
     3. 절차적 js/art.js 가 시드로 매번 다른 스카이라인을 그린다

   즉 "생성 모델"은 없고 "결정론적 생성"은 된다. 화면 캡처와
   아트 대지는 전적으로 후자로 만든다.

   전제: npm i playwright (브라우저는 /opt/pw-browsers 에 이미 있다)
   ============================================================ */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'shots');
const PAGE = 'file://' + path.join(ROOT, 'index.html');
const EXE = process.env.CHROME_PATH ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const only = process.argv[2] || '';
const say = (...a) => console.log(' ', ...a);

/* 답안을 채우고 제출해 원하는 장면까지 간다 */
async function advance(p, stopAt) {
  for (let i = 0; i < 80; i++) {
    if (await p.locator('#screen-end:not([hidden])').count()) return 'end';
    const ch = (await p.textContent('.as-hud__scene').catch(() => '') || '').trim();
    if (stopAt && ch === stopAt) return ch;
    const ta = await p.evaluate(() =>
      [...document.querySelectorAll('#parts textarea')].filter(t => !t.disabled).map(t => t.id));
    if (ta.length) {
      await p.fill('#' + ta[0],
        '제3자가 보관하는 재고이므로 조회하거나 직접 검사하고, 보관장소를 고려하여 ' +
        '입회 대상을 정하며 기말과 다른 날 실사하는 분에 대해서는 그 사이 변동에 대한 절차를 수행한다.');
      await p.evaluate(g => document.getElementById(g).click(), 'go-' + ta[0].split('-')[1]);
    } else {
      await p.evaluate(() => { const n = document.querySelector('#btn-next'); if (n) n.click(); });
    }
    await p.waitForTimeout(160);
  }
  return null;
}

/* 아트 대지 — 무대 10종 + 초상 4종을 한 장에 모은다.
   js/art.js 를 고친 뒤 전체를 한눈에 보려고 만든다. */
const SHEET = `
  <style>
    body{margin:0;background:#f3f2f2;font:600 10px/1 ui-monospace,monospace;color:#201e1d;
      padding:26px;letter-spacing:.14em}
    h1{font:800 20px/1 system-ui;letter-spacing:-.02em;margin:0 0 4px}
    .sub{font:500 10px/1.6 ui-monospace,monospace;color:#7d7979;letter-spacing:.18em;margin-bottom:22px}
    .g{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    figure{margin:0;border:2px solid #201e1d;background:#fff}
    .box{position:relative;aspect-ratio:16/7;overflow:hidden;
      filter:grayscale(1) contrast(1.1) brightness(.95)}
    .box svg{position:absolute;inset:0;width:100%;height:100%}
    figcaption{padding:8px 10px;border-top:1px solid #d7d3d3}
    .faces{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:22px}
    .faces .box{aspect-ratio:1}
    .tall{grid-column:span 1}
    .tall .box{aspect-ratio:2/3}
  </style>
  <h1>감사 시즌 2026 — 아트 대지</h1>
  <div class="sub">js/art.js · 무채색 인라인 SVG · 무대 16:7 · 초상 1:1</div>
  <div class="g" id="g"></div><div class="faces" id="f"></div>`;

async function artSheet(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 400 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(PAGE);                       // ART 를 쓰려고 먼저 앱을 띄운다
  await p.setContent(await p.evaluate(sheet => {
    document.body.innerHTML = sheet;
    var keys = ['office', 'meeting', 'warehouse', 'lab', 'server', 'desk', 'night', 'report', 'review'];
    document.getElementById('g').innerHTML = keys.map(function (k) {
      return '<figure><div class="box">' + window.ART.scene(k) + '</div>' +
        '<figcaption>' + k + '</figcaption></figure>';
    }).join('') +
      '<figure class="tall"><div class="box">' + window.ART.scene('tower') + '</div>' +
      '<figcaption>tower · 타이틀</figcaption></figure>';
    document.getElementById('f').innerHTML =
      ['partner', 'manager', 'staff', 'cfo'].map(function (k) {
        return '<figure><div class="box">' + window.ART.avatar(k) + '</div>' +
          '<figcaption>' + k + '</figcaption></figure>';
      }).join('');
    return '<!doctype html><meta charset="utf-8">' + document.head.innerHTML + document.body.outerHTML;
  }, SHEET));
  await p.waitForTimeout(250);
  const f = path.join(OUT, 'art.png');
  await p.screenshot({ path: f, fullPage: true });
  say('art.png', (fs.statSync(f).size / 1024 | 0) + 'KB');
  await ctx.close();
}

/* 화면 캡처 — README 용 */
const SHOTS = [
  { name: 'title', w: 1180, h: 1180, at: 'home' },
  { name: 'play', w: 1180, h: 1080, at: '재고실사 입회' },
  { name: 'verdict', w: 1180, h: 940, at: '재고실사 입회', submit: true },
  { name: 'ending', w: 1180, h: 1080, at: 'end' }
];

async function screens(browser) {
  for (const s of SHOTS) {
    const ctx = await browser.newContext({
      viewport: { width: s.w, height: s.h }, reducedMotion: 'reduce'
    });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(PAGE);
    await p.waitForSelector('#screen-home:not([hidden])');

    if (s.at !== 'home') {
      await p.click('#btn-start');
      await p.waitForSelector('#screen-play:not([hidden])');
      await advance(p, s.at === 'end' ? null : s.at);
      if (s.submit) {                       // 판정 화면은 한 칸을 제출해야 나온다
        const ta = await p.evaluate(() =>
          [...document.querySelectorAll('#parts textarea')].filter(t => !t.disabled).map(t => t.id));
        if (ta.length) {
          await p.fill('#' + ta[0],
            '제3자가 보관하는 재고이므로 임가공업체에 조회하거나 직접 검사하며, ' +
            '보관장소를 고려하여 입회 대상을 정한다.');
          await p.evaluate(g => document.getElementById(g).click(), 'go-' + ta[0].split('-')[1]);
          await p.waitForTimeout(420);
          await p.evaluate(() => {
            const e = document.querySelector('.as-verdict'); if (e) e.scrollIntoView({ block: 'start' });
          });
        }
      }
    }
    await p.waitForTimeout(300);
    if (s.at === 'home' || s.at === 'end') await p.evaluate(() => window.scrollTo(0, 0));

    const f = path.join(OUT, s.name + '.png');
    await p.screenshot({ path: f });
    say(s.name + '.png', (fs.statSync(f).size / 1024 | 0) + 'KB',
      errs.length ? '✕ 콘솔오류 ' + errs.length : '');
    await ctx.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  console.log('═══ 이미지 생산 → docs/shots/');
  if (only !== 'shots') await artSheet(browser);
  if (only !== 'art') await screens(browser);
  await browser.close();
})();
