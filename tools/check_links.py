#!/usr/bin/env python3
"""Controlla i link del sito: file locali, ancore (#id) e PDF indicati in data/site-data.js.
Uso:  python3 tools/check_links.py            (solo link interni, veloce)
      python3 tools/check_links.py --external  (controlla anche i link http/https)
Esce con codice 1 se trova errori, così può bloccare il deploy."""
import re, sys, urllib.request, urllib.error
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = sorted(ROOT.glob("*.html"))
EXTERNAL = "--external" in sys.argv

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.links, self.ids = [], set()
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"): self.ids.add(a["id"])
        for k in ("href", "src"):
            if a.get(k): self.links.append((tag, a[k]))

# gli id delle tappe (candidatura, rtb, …) sono generati da data/site-data.js
data = (ROOT / "data" / "site-data.js").read_text()
dynamic_ids = set(re.findall(r'"id":\s*"([^"]+)"', data))
parsed = {}
for page in PAGES:
    p = P(); p.feed(page.read_text()); parsed[page.name] = p
parsed["index.html"].ids |= dynamic_ids

errors, warnings, seen_ext = [], [], {}
def local(path_str, base):
    return (ROOT / path_str.lstrip("/")) if path_str.startswith("/") else (base.parent / path_str)

for page in PAGES:
    for tag, link in parsed[page.name].links:
        if link.startswith(("mailto:", "tel:", "data:", "javascript:")): continue
        if link.startswith(("http://", "https://")):
            if EXTERNAL and link not in seen_ext:
                try:
                    req = urllib.request.Request(link, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
                    seen_ext[link] = urllib.request.urlopen(req, timeout=15).status
                except urllib.error.HTTPError as e: seen_ext[link] = e.code
                except Exception as e: seen_ext[link] = str(e)
                if seen_ext[link] not in (200, 301, 302, 403, 405, 429): errors.append(f"{page.name}: link esterno non raggiungibile ({seen_ext[link]}): {link}")
            continue
        path, _, frag = link.partition("#")
        target = page if not path else local(path, page)
        if not target.exists(): errors.append(f"{page.name}: file mancante: {link}"); continue
        if frag and target.suffix == ".html":
            if frag not in parsed.get(target.name, P()).ids: errors.append(f"{page.name}: ancora inesistente: {link}")

# documenti dichiarati nei dati
import json
payload = json.loads(re.search(r"window\.SITE_DATA\s*=\s*(\{.*\})\s*;", data, re.S).group(1))
n_docs = 0
for b in payload["baselines"]:
    for it in b.get("items", []):
        n_docs += 1; url = it.get("url", "")
        if not url: errors.append(f"data/site-data.js: documento senza link: {it.get('name')}")
        elif not url.startswith(("http://", "https://")) and not (ROOT / url).exists():
            errors.append(f"data/site-data.js: file indicato ma non presente: {url}")
warnings.append(f"{n_docs} documenti pubblicati, {len(payload['glossary'])} termini nel glossario, {len(payload.get('members', []))} componenti")

for w in warnings: print("avviso:", w)
for e in errors: print("ERRORE:", e)
print(f"{len(PAGES)} pagine controllate, {len(errors)} errori")
sys.exit(1 if errors else 0)
