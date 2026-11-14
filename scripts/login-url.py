#!/usr/bin/env python3
"""Run privately on Dell to retrieve the current DSH login link. Never commit its output."""
import re,sys
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
origin=sys.argv[1] if len(sys.argv)>1 else 'http://10.8.0.2:3090'
if origin not in ['http://10.8.0.2:3090','http://127.0.0.1:13090','http://localhost:13090','https://audit-demo.myfangzhou.com']:
 raise SystemExit('Use the documented VPN, SSH tunnel, or public origin')
log=Path('/opt/dsh-v2/openaudit-service.log').read_text()
urls=re.findall(r'https?://[^\s\x1b]*[?&]token=[A-Za-z0-9_-]+',log)
if not urls: raise SystemExit('No launch URL found; check openaudit service')
source=urlsplit(urls[-1]);target=urlsplit(origin)
print(urlunsplit((target.scheme,target.netloc,'/',source.query,'')))
