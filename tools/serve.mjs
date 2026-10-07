/* 감사 시즌 2026 — 로컬에서 띄우기 (serve.mjs)
   실행:  node tools/serve.mjs            (http://localhost:8765)
          node tools/serve.mjs . 8080     폴더와 포트를 바꿀 때
   python -m http.server 는 동시 연결이 몰리면 끊겨 파일이 빠진다 — 그래서 이 파일을 쓴다 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(process.argv[2] || process.cwd());   // 저장소 폴더에서 실행한다 — '.' 같은 상대 경로도 절대 경로로
const PORT = +(process.argv[3] || 8765);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const buf = await readFile(f);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  } catch (e) { res.writeHead(404); res.end('not found'); }
}).listen(PORT, '127.0.0.1', 1024, () => console.log('serving', ROOT, PORT));
