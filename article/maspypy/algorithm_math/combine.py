# -*- coding: utf-8 -*-
"""Combine zh/*.md translations into one Chinese markdown for the category.
Usage: python3 combine.py <category_dir> <source_url> [title]
Each zh file should start with:
    <a id="anchor-id"></a>
    ## 文章标题
(or with a single '#' for the article title; it will be normalized to '##').

Content images extracted by extract_images.py are re-injected at their
original relative position (gfrac) inside each article.
"""
import sys, re, glob, os, json

CAT = sys.argv[1]
SRC_URL = sys.argv[2] if len(sys.argv) > 2 else ""
TITLE = sys.argv[3] if len(sys.argv) > 3 else (CAT + "讲解（maspy 博客中文翻译）")


def snap(body, target):
    """Return an insertion offset at the nearest paragraph boundary ('\\n\\n')."""
    lo, hi = 0, len(body)
    best, bestd = hi, None  # default: append at end
    i = body.find('\n\n', lo)
    while i != -1 and i <= hi:
        d = abs(i - target)
        if bestd is None or d < bestd:
            bestd = d
            best = i + 2  # start of the paragraph after the blank line
        i = body.find('\n\n', i + 2)
    return best


def inject_images(body, manifest):
    if not manifest:
        return body
    L = len(body)
    items = []
    for im in manifest:
        f = im.get('gfrac', 0.0)
        target = int(f * L)
        pos = snap(body, target)
        alt = (im.get('alt') or '').replace(']', '')
        text = '![%s](%s)\n' % (alt, im['local'])
        cap = (im.get('caption') or '').replace('\n', ' ').strip()
        if cap:
            text += '\n*%s*\n' % cap
        items.append((pos, text))
    # insert from the end so earlier offsets stay valid
    items.sort(key=lambda x: -x[0])
    for pos, text in items:
        if pos >= L:
            body = body + '\n\n' + text
        else:
            body = body[:pos] + text + body[pos:]
    return body


files = sorted(glob.glob(os.path.join(CAT, "zh", "*.md")))
articles = []  # (id, title_text, body)
for fn in files:
    txt = open(fn, encoding="utf-8").read().strip()
    mid = re.search(r'<a\s+id="([^"]+)"\s*></a>', txt)
    aid = mid.group(1) if mid else ""
    hm = re.search(r"^(#{1,6})\s+(.*)$", txt, re.M)
    if not hm:
        continue
    htext = hm.group(2).strip()
    if not aid:
        aid = re.sub(r'[^\w一-鿿]+', '', htext)[:40]
        txt = '<a id="%s"></a>\n' % aid + txt
    # normalize the first heading to level 2
    body = re.sub(r'^(#{1,6})\s', '## ', txt, count=1, flags=re.M)
    # re-inject images if available
    nn = os.path.splitext(os.path.basename(fn))[0]
    manp = os.path.join(CAT, "images", nn, "manifest.json")
    if os.path.exists(manp):
        try:
            man = json.load(open(manp, encoding="utf-8"))
            body = inject_images(body, man)
        except Exception as e:
            print("  image inject failed for", nn, e)
    articles.append((aid, htext, body))

lines = []
lines.append("# " + TITLE)
lines.append("")
lines.append("> **作者（原文）**：maspy（[maspypy.com](https://maspypy.com/)）")
if SRC_URL:
    lines.append("> **来源分类页**：[%s](%s)" % (SRC_URL, SRC_URL))
lines.append("> **说明**：本文件由分类页中列出的博客文章链接下载后翻译整理而成。数学公式（$...$ 与 $$...$$）保持原样，未作改动。")
lines.append("")
lines.append("---")
lines.append("")
lines.append("## 目录")
lines.append("")
for aid, htext, _ in articles:
    lines.append("- [%s](#%s)" % (htext, aid))
lines.append("")
lines.append("---")
lines.append("")
for aid, htext, body in articles:
    lines.append(body)
    lines.append("")

out = os.path.join(CAT, CAT + "讲解_中文.md")
open(out, "w", encoding="utf-8").write("\n".join(lines))
print("wrote", out, "articles=", len(articles))
