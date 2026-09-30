"""Google generated public verification marker; NOT an OAuth secret."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
FILENAME='googleb97045142529de5d.html'
p=ROOT/FILENAME
assert p.is_file(),'Google-generated verification marker not yet installed'
assert p.read_text()=='google-site-verification: '+FILENAME+'\n','Verification file content must match the exact Google filename'
assert 'google-site-verification' not in (ROOT/'sitemap.xml').read_text(),'Verification marker is not a portfolio sitemap page'
print('google_verification_marker_contract PASS')
