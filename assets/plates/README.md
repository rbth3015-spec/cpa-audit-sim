# 원판을 여기에 올린다

생성 모델이 뱉은 파일을 **크기·비율 그대로** 여기에 넣는다.
GitHub 웹에서 `Add file → Upload files` 로 드래그해도 된다.

```bash
node tools/plates.js assets/plates          # → assets/art/ 에 규격대로 깎는다
node tools/plates.js assets/plates --zoom=0.7   # 더 당기고 싶으면
```

파일 이름이 규격을 정한다 — `face-*` 초상 512×512 · `title*` 1000×1500 ·
`review*` 21:8 · 나머지는 무대 1600×700. 회사 전용은 `face-cfo-raon.png` 처럼.

규격과 프롬프트는 `docs/이미지요청.md`.
앱이 실제로 읽는 것은 `assets/art/` 쪽이고, 이 폴더는 원판 보관용이다.
