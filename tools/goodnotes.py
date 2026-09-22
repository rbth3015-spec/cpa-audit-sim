"""굿노트 퀴즈 노트 → 암기 카드 (tools/goodnotes.py)

   실행:  python tools/goodnotes.py "<굿노트 폴더>" [출력.js]
   예:    python tools/goodnotes.py "C:/Users/user/OneDrive/문서/카카오톡 받은 파일/Quiz (1)/Quiz"

   .goodnotes 파일은 zip 이고 안에 index.events.pb(프로토버프)가 있다.
   스키마 없이도 타이핑한 글은 UTF-8 로 그대로 들어 있어서 순서대로 뽑을 수 있다.

   한 장(card) = 'text/plain' 뒤의 첫 줄(질문) + 다음 'text/plain' 뒤의 줄들(답)

   결과는 자료/deck_notes.js 로 떨어뜨린다 — 저작권 때문에 저장소에 올리지 않는다.
"""
import json
import re
import sys
import zipfile
from pathlib import Path

sys.stdout.reconfigure(errors='replace')

ROOT = Path(__file__).resolve().parent.parent
OUT_DEFAULT = ROOT / '자료' / 'deck_notes.js'

# 버릴 조각 — UUID · 내부 토큰 · 빈 글
JUNK = re.compile(r'^[0-9A-Fa-f\-]{8,}$|^[A-Za-z0-9+/=]{6,}$|^text/plain$|^[A-Za-z]{1,3}$')
RUN = re.compile(r'[가-힣A-Za-z0-9][가-힣0-9A-Za-z \t·,.()\-~%\'"/:;\[\]{}<>?!&+=×→①②③④⑤ⓐⓑⓒⓓ]{2,}')


def runs_of(path):
    z = zipfile.ZipFile(path)
    if 'index.events.pb' not in z.namelist():
        return []
    txt = z.read('index.events.pb').decode('utf-8', 'ignore')
    out = []
    for m in RUN.finditer(txt):
        s = m.group(0).strip()
        if not s:
            continue
        out.append(s)
    return out


def clean(s):
    s = s.strip()
    # 프로토버프 길이 바이트가 첫 글자에 붙는다 (예: "U이기적 위협…", "a1. 제3자에게…")
    if len(s) > 2 and re.match(r'^[A-Za-z0-9]$', s[0]) and re.match(r'^[가-힣]', s[1]):
        s = s[1:]     # 길이 바이트가 붙은 경우 ("U이기적…", "1보고기간말…")
    s = re.sub(r'\s+', ' ', s)
    return s.strip(' ·,')


UUIDISH = re.compile(r'[0-9A-Fa-f]{6,}-[0-9A-Fa-f]{3,}')


def korean_ratio(s):
    k = len(re.findall(r'[가-힣]', s))
    return k / max(1, len(s))


def useful(s):
    if not s or len(s) < 4:
        return False
    if UUIDISH.search(s) or JUNK.match(s):
        return False
    return korean_ratio(s) >= 0.3


QTAIL = re.compile(r'(사항|절차|이유|경우|요건|방법|구분|의미|예시|효익|차이|내용|종류|대상|기준|범위|요소|원칙|고려|정의|판단|영향|시기|순서|조건|권한|책임|의무|위협|단계|유형|방식|가지|무엇|은|는)$')


def looks_like_answer(lines):
    """답 덩이 — 번호가 둘 이상 붙어 있거나, 서술어로 끝나거나, 길다"""
    if not lines:
        return False
    joined = ' '.join(lines)
    nums = len(re.findall(r'(?:^|\s)\d+[).]', joined))
    if nums >= 2:
        return True
    if re.match(r'^\s*(\d+[).]|[-·•①②③④⑤ⓐ])', lines[0]):
        return True
    if re.search(r'(함|한다|된다|이다|하여야 한다|해야 한다)\s*$', joined):
        return True
    return len(lines) >= 3 or len(joined) > 160


def looks_like_question(lines):
    """질문 덩이 — 짧고, 명사로 끝난다"""
    if not lines or len(lines) > 3:
        return False
    joined = ' '.join(lines).strip()
    if len(joined) > 70:
        return False
    return bool(QTAIL.search(joined))


def cards_of(path):
    """굿노트 한 쪽 = 제목 상자(질문) + 내용 상자(답). 순서가 뒤집힌 쪽도 있어 길이로 가른다"""
    z = zipfile.ZipFile(path)
    txt = z.read('index.events.pb').decode('utf-8', 'ignore')
    groups = []
    for b in txt.split('text/plain'):
        lines = [clean(m.group(0)) for m in RUN.finditer(b)]
        lines = [x for x in lines if useful(x)]
        if lines:
            groups.append(lines)

    cards, i = [], 0
    while i + 1 < len(groups):
        a, b = groups[i], groups[i + 1]
        # 질문처럼 보이는 쪽을 앞으로. 둘 다 애매하면 짧은 쪽이 질문
        qa = (a, b) if looks_like_question(a) and not looks_like_question(b) else \
             (b, a) if looks_like_question(b) and not looks_like_question(a) else \
             (a, b) if (looks_like_answer(b) and not looks_like_answer(a)) else \
             (b, a) if (looks_like_answer(a) and not looks_like_answer(b)) else \
             (a, b) if sum(len(x) for x in a) <= sum(len(x) for x in b) else (b, a)
        q, ans = qa
        cards.append({'q': ' '.join(q).strip(), 'a': ans})
        i += 2
    return cards


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else OUT_DEFAULT
    files = sorted(src.rglob('*.goodnotes'))
    if not files:
        raise SystemExit('굿노트 파일이 없습니다: ' + str(src))

    deck, seen = [], {}
    for f in files:
        part = f.parent.name                      # 1편. 회계감사의 기초
        chap = f.stem                             # 1편1장. 감사의 개념과 분류
        std = chap.split('.', 1)[-1].strip()
        try:
            cs = cards_of(f)
        except Exception as e:
            print(f'  ! {chap}: {e}')
            continue
        kept = 0
        for k, c in enumerate(cs):
            q, a = c['q'].strip(), [x for x in c['a'] if x.strip()]
            if len(q) < 5 or not a:
                continue
            # 질문이 답을 그대로 반복하거나, 답이 질문 한 줄뿐이면 버린다
            if len(a) == 1 and (a[0] == q or a[0] in q or q in a[0]):
                continue
            key = re.sub(r'[^가-힣0-9]', '', q)
            if not key:
                continue
            if key in seen:                        # 같은 질문이면 답이 많은 쪽을 남긴다
                old = seen[key]
                if len(a) > len(old['a']):
                    old['a'] = [x[:220] for x in a[:12]]
                continue
            item = {
                'id': 'n%02d%03d' % (files.index(f) + 1, k + 1),
                'std': std, 'tag': part.split('.', 1)[-1].strip(),
                'q': q[:120], 'a': [x[:220] for x in a[:12]], 'src': '내 노트'
            }
            seen[key] = item
            deck.append(item)
            kept += 1
        print(f'  {chap[:40]:42} {kept:4}장')
    n = len(deck)

    body = ('/* 굿노트 퀴즈 노트에서 옮긴 암기 카드 — tools/goodnotes.py 가 만든다.\n'
            '   교재에서 정리한 내용이라 저장소에 올리지 않는다. */\n'
            'window.DECK_NOTES = ' + json.dumps(deck, ensure_ascii=False, indent=0).replace('\n', '\n') + ';\n')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(body, encoding='utf-8')
    print(f'\n카드 {n}장 → {out}')


if __name__ == '__main__':
    main()
