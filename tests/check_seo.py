"""Offline SEO regression checks. Run: python tests/check_seo.py"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, unquote
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://www.admiral-post.com'


class Document(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


pages = {}
for entry in ET.parse(ROOT / 'sitemap.xml').getroot():
    url = entry.find('{*}loc').text
    path = urlparse(url).path
    file = ROOT / (path.lstrip('/') + ('index.html' if path.endswith('/') else ''))
    text = file.read_text()
    doc = Document(text)
    assert url not in pages, f'Duplicate sitemap URL: {url}'
    pages[url] = (doc, text)
    canonical = [a['href'] for tag, a in doc.tags if tag == 'link' and a.get('rel') == 'canonical']
    assert canonical == [url], f'Canonical mismatch: {url}'
    assert not any('noindex' in a.get('content', '') for tag, a in doc.tags if tag == 'meta' and a.get('name') == 'robots'), url
    for script in re.findall(r'<script type="application/ld\+json">(.*?)</script>', text, re.S):
        schema = json.loads(script)
        assert '"USD"' not in json.dumps(schema), f'Obsolete dollar offer: {url}'
    assert 'shipping-price-table' in text, f'Missing price examples: {url}'

for url, (doc, text) in pages.items():
    base = next((urljoin(url, a['href']) for tag, a in doc.tags if tag == 'base'), url)
    for tag, attrs in doc.tags:
        if tag == 'link' and 'hreflang' in attrs:
            target = attrs['href']
            assert target in pages, f'Hreflang URL absent from sitemap: {target}'
            assert any(a.get('href') == url and 'hreflang' in a for _, a in pages[target][0].tags), f'Nonreciprocal hreflang: {url}'
        if tag not in ('a', 'img', 'script'):
            continue
        href = attrs.get('href' if tag == 'a' else 'src')
        if not href:
            continue
        target = urlparse(urljoin(base, href))
        if target.netloc != 'www.admiral-post.com':
            continue
        file = ROOT / (target.path.lstrip('/') + ('index.html' if target.path.endswith('/') else ''))
        assert file.exists(), f'Missing local resource: {url} -> {href}'
        target_url = ORIGIN + target.path
        if target.fragment and target_url in pages:
            assert any(a.get('id') == unquote(target.fragment) for _, a in pages[target_url][0].tags), f'Missing anchor: {url} -> {href}'

# Check all static examples against the existing RU and HE calculator formulas.
tariffs = {}
for language, url in [('ru', ORIGIN + '/'), ('he', ORIGIN + '/he/')]:
    text = pages[url][1]
    parsed = {}
    for key, fields in re.findall(r'(\w+):\s*\{([^{}]*limit:\d+[^{}]*)\}', text):
        parsed[key] = {k: int(v) for k, v in re.findall(r'(limit|base|included|extra):(\d+)', fields)}
    assert len(parsed) == 8, f'Missing calculator routes: {language}'
    if tariffs:
        assert parsed == tariffs, 'RU and HE calculator tariffs differ'
    tariffs = parsed

comparisons = 0
for url, (_, text) in pages.items():
    if '/delivery-' in url:
        key = urlparse(url).path.removeprefix('/delivery-').removesuffix('.html').removesuffix('-he').removesuffix('-en')
        keys = ['usa', 'canada'] if key == 'usa-canada' else [key]
    else:
        keys = list(tariffs)
    table = re.search(r'<table class="shipping-price-table">(.*?)</table>', text, re.S)[1]
    amounts = [int(v) for v in re.findall(r'<bdi>₪(\d+)</bdi>', table)]
    expected = [tariffs[k]['base'] + max(0, w - tariffs[k]['included']) * tariffs[k]['extra'] for k in keys for w in (2, 5, 10)]
    assert amounts == expected, f'Price table differs from calculator: {url}'
    comparisons += len(amounts)

print(f'PASS: {len(pages)} canonical pages, reciprocal hreflang, JSON-LD, local links/assets/anchors, {comparisons} price examples, RU/HE tariff parity.')
