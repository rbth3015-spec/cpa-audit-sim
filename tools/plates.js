/* 감사 시즌 2026 — 원판 후처리 (plates.js)
   실행:  node tools/plates.js <입력파일 또는 폴더> [출력폴더]
   ------------------------------------------------------------
   생성 모델로 받은 사진(원판)을 코드가 쓰는 규격으로 깎는다.

   이 저장소에는 래스터 라이브러리가 없다 — PIL · ImageMagick · sharp 전부.
   그래서 Chromium 의 <canvas> 를 이미지 처리기로 쓴다.
   드로우 → 크롭 → 리사이즈 → 무채색 → 재인코딩까지 전부 브라우저 안에서 끝나고
   결과만 base64 로 꺼내 파일로 적는다. 외부 의존이 Chromium 하나뿐이라
   이 컨테이너에서도, 사용자 노트북에서도 똑같이 돈다.

   규격 (파일 이름 앞부분으로 고른다)
     face-*    1:1   512×512    인물 초상
     title*    2:3   1000×1500  타이틀 아트 패널
     review*   21:8  1800×686   엔딩 히어로
     그 외     16:7  1600×700   무대

   크롭은 "가운데"가 아니라 규격마다 다르다. 무대는 피사체가 상단 65% 에
   있어야 하므로 위쪽을 살리고, 초상은 얼굴이 위 35~45% 에 오도록 위를 살린다.

   zoom 은 원본에서 얼마나 당겨 쓸지다. 초상은 136px 로 줄여 놓으면 얼굴이
   작아서 누가 누군지 안 보인다 — 여백을 덜어내고 당겨야 읽힌다.
   덤으로 네 귀퉁이가 잘려 나가므로 생성기 워터마크가 모서리에 있으면 같이 빠진다.
   ============================================================ */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const EXE = process.env.CHROME_PATH ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const SPEC = [
  [/^face-/, { w: 512, h: 512, anchor: 0.30, zoom: 0.76, name: '초상' }],
  [/^title/, { w: 1000, h: 1500, anchor: 0.30, name: '타이틀' }],
  [/^review/, { w: 1800, h: 686, anchor: 0.42, name: '엔딩 히어로' }],
  [/./, { w: 1600, h: 700, anchor: 0.38, name: '무대' }]
];
/* 명령행에서 조정 — node tools/plates.js <입력> [출력] --zoom=0.8 --anchor=0.25 */
const argOf = k => {
  const a = process.argv.find(x => x.indexOf('--' + k + '=') === 0);
  return a ? parseFloat(a.split('=')[1]) : null;
};
const specFor = f => SPEC.find(([re]) => re.test(path.basename(f)))[1];

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/* 브라우저 안에서 도는 코드. 여기가 실제 이미지 처리기다.
   (이름을 process 로 두면 전역 process 를 가려서 argv 를 못 읽는다) */
async function bake(page, dataUrl, spec) {
  return page.evaluate(async ([src, s]) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = src; });

    /* 목표 비율에 맞춰 원본에서 잘라낼 영역을 구한다 (cover) */
    const want = s.w / s.h, have = img.width / img.height;
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if (have > want) { sw = img.height * want; sx = (img.width - sw) / 2; }
    else { sh = img.width / want; sy = (img.height - sh) * s.anchor; }
    /* 당겨 쓰기 — 가로는 가운데를 지키고, 세로는 anchor 쪽을 남긴다 */
    if (s.zoom && s.zoom < 1) {
      const nw = sw * s.zoom, nh = sh * s.zoom;
      sx += (sw - nw) / 2; sy += (sh - nh) * s.anchor;
      sw = nw; sh = nh;
    }

    const c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    /* 무채색으로 굽는다 — 화면에서 CSS 가 한 번 더 걸지만, 원판부터 무채색이어야
       색이 있는 원본이 섞였을 때 톤이 튀지 않는다 */
    g.filter = 'grayscale(1)';
    g.drawImage(img, sx, sy, sw, sh, 0, 0, s.w, s.h);

    return { url: c.toDataURL('image/jpeg', 0.86), src: [img.width, img.height] };
  }, [dataUrl, spec]);
}

(async () => {
  const input = process.argv[2];
  if (!input) { console.log('사용법: node tools/plates.js <파일|폴더> [출력폴더]'); process.exit(1); }
  const outDir = (process.argv[3] && process.argv[3].indexOf("--") !== 0 ? process.argv[3] : null) || path.join(__dirname, '..', 'assets', 'art');

  if (input.indexOf('--') === 0) { console.log('첫 인자는 파일이나 폴더여야 한다'); process.exit(1); }
  const files = fs.statSync(input).isDirectory()
    ? fs.readdirSync(input).filter(f => MIME[path.extname(f).toLowerCase()]).map(f => path.join(input, f))
    : [input];
  if (!files.length) { console.log('처리할 이미지가 없다:', input); return; }

  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await (await browser.newContext()).newPage();
  await page.goto('about:blank');

  console.log('═══ 원판 후처리 →', outDir);
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const dataUrl = 'data:' + MIME[ext] + ';base64,' + fs.readFileSync(f).toString('base64');
    const spec = Object.assign({}, specFor(f));
    if (argOf('zoom') != null) spec.zoom = argOf('zoom');
    if (argOf('anchor') != null) spec.anchor = argOf('anchor');
    const r = await bake(page, dataUrl, spec);
    const out = path.join(outDir, path.basename(f, ext) + '.jpg');
    fs.writeFileSync(out, Buffer.from(r.url.split(',')[1], 'base64'));
    console.log('  ' + path.basename(out).padEnd(22) +
      r.src.join('×') + ' → ' + spec.w + '×' + spec.h +
      '  ' + spec.name + '  ' + (fs.statSync(out).size / 1024 | 0) + 'KB');
  }
  await browser.close();
})();
