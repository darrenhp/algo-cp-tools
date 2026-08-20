import re, html, os, glob
from html.parser import HTMLParser

BLOCK = {'p','div','h1','h2','h3','h4','h5','h6','li','tr','br','section',
         'blockquote','ul','ol','table','thead','tbody','pre','code','hr','article'}

class Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0          # depth of entry-content div
        self.capturing = False
        self.in_pre = 0
        self.in_code = 0
        self.skip = 0           # depth of script/style to skip
        self.parts = []         # collected text pieces
        self.title = ''

    def handle_starttag(self, tag, attrs):
        if self.skip > 0:
            if tag in ('script','style'):
                self.skip += 1
            return
        if tag in ('script','style'):
            self.skip += 1
            return
        # enter entry-content
        if not self.capturing and tag == 'div':
            d = dict(attrs)
            cls = d.get('class','')
            if 'entry-content' in cls.split():
                self.capturing = True
                self.depth = 1
                return
        if not self.capturing:
            # capture h1 title even before body (category title etc.) - optional
            return
        if tag in BLOCK:
            # block separator
            if tag in ('br','hr'):
                self.parts.append('\n')
            else:
                self.parts.append('\n\n')
        if tag == 'pre':
            self.in_pre += 1
            self.parts.append('\n```\n')
        if tag == 'code':
            self.in_code += 1
            if self.in_pre == 0:
                self.parts.append('`')
        if tag == 'div':
            self.depth += 1
        if tag == 'table':
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if self.skip > 0:
            if tag in ('script','style'):
                self.skip -= 1
            return
        if not self.capturing:
            return
        if tag == 'pre':
            self.in_pre -= 1
            self.parts.append('\n```\n')
            return
        if tag == 'code':
            self.in_code -= 1
            if self.in_code == 0 and self.in_pre == 0:
                self.parts.append('`')
            return
        if tag in BLOCK and tag != 'br':
            self.parts.append('\n')
        if tag == 'div':
            self.depth -= 1
            if self.depth == 0:
                # closing the entry-content div
                self.capturing = False

    def handle_data(self, data):
        if self.skip > 0:
            return
        if not self.capturing:
            return
        if self.in_pre > 0:
            self.parts.append(data)
        else:
            # collapse runs of whitespace (keep single spaces)
            txt = data.replace('\n',' ').replace('\r',' ')
            txt = re.sub(r'[ \t]+',' ', txt)
            self.parts.append(txt)

def extract(path):
    raw = open(path, encoding='utf-8', errors='replace').read()
    p = Extractor()
    p.feed(raw)
    text = ''.join(p.parts)
    # cleanup blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]+\n', '\n', text)
    text = text.strip()
    return text

if __name__ == '__main__':
    os.makedirs('blogs_text', exist_ok=True)
    for fn in sorted(glob.glob('blogs_raw/article_*.html')):
        txt = extract(fn)
        out = fn.replace('blogs_raw','blogs_text').replace('.html','.txt')
        open(out,'w',encoding='utf-8').write(txt)
        print(os.path.basename(out), len(txt))
