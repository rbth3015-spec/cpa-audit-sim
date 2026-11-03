"""회계감사기준 문단 지식베이스 만들기 (kb_build.py)
------------------------------------------------------------
  python -I tools/kb_build.py "<회계감사기준 전문 .docx>"      → 자료/kb/ksa.jsonl

원본 Word 파일의 문단 스타일로 문단 번호를 되살린다. (텍스트로 뽑은 자료/ksa_2026.txt 에는 자동 번호가 빠져 있다)
  문단      요구사항 · 서론 문단 — 기준서 안에서 1, 2, 3 … (같은 스타일에 단계만 내린 것은 목록으로 본다)
  문단A     적용 및 기타 설명자료 — A1, A2 …
  목록A/B/C 앞 문단의 (a) (b) … / (i) (ii) … / 가 나 …  — 앞 문단에 붙인다
  불릿목록   앞 문단에 붙인다
  보론 제목  그 뒤 문단은 '보론n-' 번호로 따로 센다
한 줄 = 문단 하나: { id: '505-9', std: '505', no: '9', kind: '요구사항'|'적용지침'|'보론', title, heading, text, items[] }

원문은 저작권이 있어 저장소에 올리지 않는다(자료/ 는 .gitignore). 저장소에는 이 코드만 둔다.
"""
import sys, os, re, json, io
import docx
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph

sys.stdout.reconfigure(encoding='utf-8')
SRC = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, '자료', 'kb', 'ksa.jsonl')

ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii']
KOR = '가나다라마바사아자차카타파하'

def letters(n):
    return '(' + 'abcdefghijklmnopqrstuvwxyz'[n] + ')' if n < 26 else '(' + str(n) + ')'

d = docx.Document(SRC)
recs = []
std = title = None
heading = ''
req = app = 0          # 문단 · 문단A 번호
appendix = 0           # 보론 순번 (0 이면 본문)
apx_no = 0
kind = '요구사항'
cur = None
sub = {'A': 0, 'B': 0, 'C': 0}

def flush():
    global cur
    if cur:
        cur['text'] = cur['text'].strip()
        recs.append(cur)
    cur = None

def unnumbered(p):
    # 스타일은 번호 문단인데 문단 자체에서 번호를 끈 경우(numId 0) — 앞 문단에 이어지는 글
    pPr = p._p.pPr
    return pPr is not None and pPr.numPr is not None and pPr.numPr.numId is not None and pPr.numPr.numId.val == 0

NUMBERING = d.part.numbering_part.element
ABSTRACT = {a.get(qn('w:abstractNumId')): a for a in NUMBERING.findall(qn('w:abstractNum'))}
NUMS = {n.get(qn('w:numId')): n.find(qn('w:abstractNumId')).get(qn('w:val')) for n in NUMBERING.findall(qn('w:num'))}
LIST_OF = {'(%2)': '목록A', '(%3)': '목록B', '%1)': '목록B', '%4.': '목록C'}

def lvl_text(num_id, ilvl):
    a = ABSTRACT.get(NUMS.get(str(num_id)))
    if a is None:
        return None
    for l in a.findall(qn('w:lvl')):
        if l.get(qn('w:ilvl')) == str(ilvl):
            t = l.find(qn('w:lvlText'))
            return t.get(qn('w:val')) if t is not None else None
    return None

def list_style(p):
    # 문단 스타일 그대로 번호 형식만 목록으로 바꾼 경우 — 본문 번호는 '%1.' 과 'A%1.' 뿐이다
    pPr = p._p.pPr
    if pPr is None or pPr.numPr is None or pPr.numPr.numId is None:
        return None
    t = lvl_text(pPr.numPr.numId.val, pPr.numPr.ilvl.val if pPr.numPr.ilvl is not None else 0)
    return None if t in ('%1.', 'A%1.', None) else LIST_OF.get(t, '목록C')

def body_paragraphs():
    # 표 안 문단까지 문서 순서대로 — 315 문단 21~26 은 2열 표 안에 있다
    for el in d.element.body.iterchildren():
        if el.tag == qn('w:p'):
            yield Paragraph(el, d)
        elif el.tag == qn('w:tbl'):
            for q in el.iter(qn('w:p')):
                yield Paragraph(q, d)

for p in body_paragraphs():
    st = p.style.name
    tx = re.sub(r'\s+', ' ', p.text).strip()
    if st in ('문단', '문단A') and unnumbered(p):
        if cur is not None and tx:
            cur['items'].append('· ' + tx)
        continue
    if st in ('문단', '문단A') and list_style(p):
        st = list_style(p)
    if st == 'Heading 1':
        m = re.match(r'감사기준서\s*(\d+)', tx)
        if not m:
            continue
        flush()
        std = m.group(1)
        title = tx[m.end():].strip()
        req = app = appendix = apx_no = 0
        heading = ''
        kind = '요구사항'
        continue
    if std is None or not tx:
        continue
    if st == '목차':
        continue
    if st == '보론 제목':
        flush()
        appendix += 1
        apx_no = 0
        heading = tx
        kind = '보론'
        continue
    if st.startswith('Heading'):
        flush()
        heading = tx
        if '적용 및 기타 설명자료' in tx:
            kind = '적용지침'
        continue
    if st == '문단':
        flush()
        if appendix:
            apx_no += 1
            no = '보론%d-%d' % (appendix, apx_no)
        else:
            req += 1
            no = str(req)
        cur = {'id': std + '-' + no, 'std': std, 'no': no, 'kind': kind if kind != '적용지침' else '요구사항',
               'title': title, 'heading': heading, 'text': tx, 'items': []}
        sub = {'A': 0, 'B': 0, 'C': 0}
        continue
    if st == '문단A':
        flush()
        app += 1
        no = 'A%d' % app
        cur = {'id': std + '-' + no, 'std': std, 'no': no, 'kind': '적용지침',
               'title': title, 'heading': heading, 'text': tx, 'items': []}
        sub = {'A': 0, 'B': 0, 'C': 0}
        continue
    # 목록 · 불릿 · 그 밖의 본문 — 앞 문단에 붙인다
    if cur is None:
        continue
    if st == '목록A':
        lab = letters(sub['A']); sub['A'] += 1; sub['B'] = 0
    elif st == '목록B':
        lab = '(' + (ROMAN[sub['B']] if sub['B'] < len(ROMAN) else str(sub['B'])) + ')'; sub['B'] += 1
    elif st == '목록C':
        lab = KOR[sub['C'] % len(KOR)] + '.'; sub['C'] += 1
    else:
        lab = '·'
    cur['items'].append(lab + ' ' + tx)
flush()

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    for r in recs:
        f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
by = {}
for r in recs:
    by.setdefault(r['std'], [0, 0])[0 if r['kind'] != '적용지침' else 1] += 1
print(len(recs), '문단 →', OUT)
print(' · '.join('%s(%d/%d)' % (k, v[0], v[1]) for k, v in by.items()))
