"""Verify local-only, Unicode-scoped mixed-language typography."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[2]
css=(ROOT/'style.css').read_text()
faces=re.findall(r'@font-face\s*\{([^}]+)\}',css,re.S)
latin=next((f for f in faces if 'KW Latin' in f),None)
cjk=next((f for f in faces if 'KW Chinese' in f),None)
assert latin is not None and cjk is not None,'Missing explicit English/digits and Chinese font routing'
assert 'local("Times New Roman")' in latin
assert 'U+0000-024F' in latin and 'U+2E80-9FFF' not in latin
assert 'local("SimSun")' in cjk and 'local("宋体")' in cjk
assert cjk.index('local("SimSun")') < cjk.index('local("Songti SC")')
assert 'U+2E80-9FFF' in cjk and 'U+0000-024F' not in cjk
assert not any('url(' in f for f in faces),'Font assets must stay local; no unlicensed font distribution or third-party font fetch'
assert '--serif-mixed: "KW Latin", "KW Chinese", "Times New Roman"' in css
assert 'font: inherit' in css and 'var(--serif-mixed)' in css
print('typography_contract PASS: Songti/Simsun Chinese; Times New Roman English/digits; local Unicode routing')
