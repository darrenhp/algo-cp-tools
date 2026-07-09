# -*- coding: utf-8 -*-
"""Extract content images from each article's original HTML, download them
locally, and record their relative position (gfrac) for re-injection.

Usage: python3 extract_images.py <category_dir>

For every CAT/zh/NN.md it looks for CAT/blogs_raw/article_NN.html, pulls the
<figure><img> images living under /wp-content/uploads/, downloads each to
CAT/images/NN/<file>, and writes CAT/images/NN/manifest.json:
    [{"local": "images/NN/x.png", "alt": "...", "gfrac": 0.42, "caption": "..."}, ...]
gfrac is the image's position as a fraction of the article's total text length,
so it can be re-injected at the same relative spot in the translated markdown.
"""
import sys, re, os, glob, json
from html.parser import HTMLParser
import urllib.request

SKIP_FILES = ("5Dth6Yjz_400x400.jpg",)  # author avatar / og image

def normalize_src(src):
    # prefer full-size image: strip a trailing -WxH resize token
    return re.sub(r'-(\d+)x(\d+)(?=\.\w+$)', '', src)

class ImgExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.capturing = False
        self.depth = 0
        self.skip = 0
        self.in_fig = 0
        self.pending = None        # (src, alt) for an <img> awaiting </figure>
        self.figcap = []
        self.text_len = 0          # cumulative text length so far
        self.images = []           # (abs_pos, src, alt, caption)

    def _finalize(self, src, alt, cap):
        if src and '/wp-content/uploads/' in src and not any(f in src for f in SKIP_FILES):
            abs_pos = self.text_len - len(cap)  # image sits before its caption
            self.images.append((abs_pos, normalize_src(src), alt, cap))

    def handle_starttag(self, tag, attrs):
        if self.skip > 0:
            if tag in ('script', 'style'):
                self.skip += 1
            return
        if tag in ('script', 'style'):
            self.skip += 1
            return
        if not self.capturing and tag == 'div':
            d = dict(attrs)
            cls = d.get('class', '')
            if 'entry-content' in cls.split():
                self.capturing = True
                self.depth = 1
                return
        if not self.capturing:
            return
        if tag == 'figure':
            self.in_fig += 1
            self.pending = None
            self.figcap = []
        if tag == 'img':
            d = dict(attrs)
            src = d.get('data-lazy-src') or d.get('data-src') or d.get('src') or ''
            alt = d.get('alt', '')
            if self.in_fig > 0:
                # defer until </figure> so we can pick up the <figcaption>
                self.pending = (src, alt)
            else:
                # bare <img> directly in content
                self._finalize(src, alt, "")
        if tag == 'div':
            self.depth += 1

    def handle_endtag(self, tag):
        if self.skip > 0:
            if tag in ('script', 'style'):
                self.skip -= 1
            return
        if not self.capturing:
            return
        if tag == 'figure':
            if self.pending:
                cap = ''.join(self.figcap).strip()
                self._finalize(self.pending[0], self.pending[1], cap)
            self.pending = None
            self.in_fig -= 1
        if tag == 'div':
            self.depth -= 1
            if self.depth == 0:
                self.capturing = False

    def handle_data(self, data):
        if self.skip > 0 or not self.capturing:
            return
        t = data.replace('\n', ' ').replace('\r', ' ')
        self.text_len += len(t)
        if self.in_fig > 0:
            self.figcap.append(t)


def download(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest):
        return True
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r, open(dest, 'wb') as f:
            f.write(r.read())
        return True
    except Exception as e:
        print("  download failed:", url, "->", e)
        return False


def process(cat):
    base = cat
    total = 0
    for zh in sorted(glob.glob(os.path.join(base, "zh", "*.md"))):
        nn = os.path.splitext(os.path.basename(zh))[0]
        raw = os.path.join(base, "blogs_raw", "article_%s.html" % nn)
        if not os.path.exists(raw):
            print("skip (no raw):", nn)
            continue
        html = open(raw, encoding='utf-8', errors='replace').read()
        p = ImgExtractor()
        p.feed(html)
        if not p.images or p.text_len == 0:
            continue
        man = []
        for abs_pos, src, alt, cap in p.images:
            fname = os.path.basename(src.split('?')[0])
            local = os.path.join("images", nn, fname)
            dest = os.path.join(base, local)
            ok = download(src, dest)
            if not ok:
                local = src  # fall back to remote URL
            man.append({
                "local": local.replace(os.sep, '/'),
                "alt": alt or os.path.splitext(fname)[0],
                "gfrac": abs_pos / p.text_len,
                "caption": cap,
            })
        outdir = os.path.join(base, "images", nn)
        os.makedirs(outdir, exist_ok=True)
        json.dump(man, open(os.path.join(outdir, "manifest.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        total += len(man)
        print("  %s: %d images" % (nn, len(man)))
    print("category %s done, %d images total" % (cat, total))


if __name__ == '__main__':
    for c in sys.argv[1:]:
        process(c)
