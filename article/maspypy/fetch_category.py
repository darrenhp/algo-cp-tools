# -*- coding: utf-8 -*-
"""Fetch all posts of a maspypy category page and save their HTML into <OUT>/blogs_raw/.
Usage: python3 fetch_category.py <category_url> <OUT_dir>
"""
import sys, re, os, subprocess, time

CAT = sys.argv[1].rstrip('/')
OUT = sys.argv[2]
UA = "Mozilla/5.0 (compatible; research-bot/1.0)"

def get(url):
    p = subprocess.run(['curl', '-s', '-m', '40', '-A', UA, '-o', '-', url],
                       capture_output=True, text=True)
    return p.stdout

def post_links(html):
    urls = re.findall(r'href="([^"]+)"', html)
    out = []
    for u in urls:
        u = u.split('?')[0]
        if not u.startswith('https://maspypy.com/'):
            continue
        if any(k in u for k in ['/wp-content/', '/category/', '/tag/',
                                 '/author/', '/feed', '/page/']):
            continue
        out.append(u)
    seen = set(); res = []
    for u in out:
        if u not in seen:
            seen.add(u); res.append(u)
    return res

os.makedirs(os.path.join(OUT, 'blogs_raw'), exist_ok=True)

all_posts = []
seen_posts = set()
page = 1
while True:
    url = CAT if page == 1 else CAT + '/page/' + str(page) + '/'
    print('fetching list:', url)
    html = get(url)
    if not html:
        print('  empty, stop')
        break
    links = post_links(html)
    new = [l for l in links if l not in seen_posts]
    for l in new:
        seen_posts.add(l); all_posts.append(l)
    if not new:
        break
    page += 1
    if page > 30:
        break

print('total posts:', len(all_posts))
for i, u in enumerate(all_posts, 1):
    fn = os.path.join(OUT, 'blogs_raw', 'article_%02d.html' % i)
    if os.path.exists(fn) and os.path.getsize(fn) > 1000:
        print('  skip', fn)
        continue
    print('  download %02d: %s' % (i, u))
    html = get(u)
    if html:
        open(fn, 'w', encoding='utf-8').write(html)
    time.sleep(0.3)
print('done.', OUT)
