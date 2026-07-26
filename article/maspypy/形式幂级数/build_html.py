# -*- coding: utf-8 -*-
"""Convert 形式幂级数讲解_中文.md -> 形式幂级数讲解_中文.html
A self-contained, nicely styled HTML with a left sidebar TOC and MathJax rendering."""
import re
import mistune

SRC = "形式幂级数讲解_中文.md"
OUT = "形式幂级数讲解_中文.html"

raw = open(SRC, encoding="utf-8").read()
lines = raw.split("\n")

# ---- 1. strip <a id="..."></a> anchor lines, remember mapping to next heading ----
anchor_re = re.compile(r'^\s*<a\s+id="([^"]+)"\s*></a>\s*$')
heading_re = re.compile(r"^(#{1,6})\s+(.*)$")
ids_in_order = []  # desired id for each heading, in document order
pending = None
clean = []
for ln in lines:
    m = anchor_re.match(ln)
    if m:
        pending = m.group(1)
        continue
    hm = heading_re.match(ln)
    if hm:
        ids_in_order.append(pending)
        pending = None
    clean.append(ln)
text = "\n".join(clean)

# ---- 2. protect math (display first, then inline) ----
math = []

def protect_display(m):
    math.append(m.group(0))
    return "@@MATHD%d@@" % (len(math) - 1)

def protect_inline(m):
    math.append(m.group(0))
    return "@@MATHI%d@@" % (len(math) - 1)

text = re.sub(r"\$\$(.+?)\$\$", protect_display, text, flags=re.DOTALL)
text = re.sub(r"(?<!\$)\$(?!\$)([^$\n]+?)(?<!\$)\$(?!\$)", protect_inline, text)

# ---- 3. render with mistune, assign ids to headings ----
class Renderer(mistune.HTMLRenderer):
    def heading(self, text, level, **attrs):
        hid = None
        if self._order < len(ids_in_order):
            hid = ids_in_order[self._order]
        self._order += 1
        if not hid:
            hid = "sec-%d" % self._order
        return '<h%d id="%s">%s</h%d>\n' % (level, hid, text, level)

r = Renderer()
r._order = 0
md = mistune.create_markdown(renderer=r)
body = md(text)

# lift placeholders that sit alone in a <p> so they become block-level
body = re.sub(r"<p>(@@MATH[DI]\d+@@)</p>", r"\1", body)

# ---- 4. restore math (escape only '<' inside math) ----
def restore(m):
    tok = m.group(0)
    idx = int(re.search(r"\d+", tok).group(0))
    s = math[idx]
    s = s.replace("<", "&lt;")
    if tok.startswith("@@MATHD"):
        return '<div class="math-block">%s</div>' % s
    return s

body = re.sub(r"@@MATH[DI]\d+@@", restore, body)

# ---- 4b. wrap marker paragraphs into colored callout blocks ----
# 参考原站：问题=琥珀(amber)、解答=青柠(lime)；并扩展 定理 / 定义 为同类色块。
_callout_re = re.compile(r"<p>(.*?)</p>", re.DOTALL)

def _wrap_callout(m):
    inner = m.group(1)
    if re.match(r"\s*<strong>【问题", inner):
        cls = "callout-problem"
    elif re.match(r"\s*<strong>【解答", inner):
        cls = "callout-solution"
    elif re.match(r"\s*<strong>【定理", inner):
        cls = "callout-theorem"
    elif re.match(r"\s*<strong>【定义", inner):
        cls = "callout-definition"
    elif re.match(r"\s*<strong>【命題", inner):
        cls = "callout-theorem"
    else:
        return m.group(0)
    return '<div class="%s">%s</div>' % (cls, m.group(0))

body = _callout_re.sub(_wrap_callout, body)

# ---- 5. assemble HTML ----
CSS = """
:root{
  --bg:#fbfbfa; --fg:#23272e; --muted:#6b7280; --accent:#b45309;
  --accent-soft:#f3e7d3; --border:#e6e3dd; --code-bg:#f1eee9;
  --quote-bg:#f6f3ee; --sidebar-bg:#f7f5f1; --sidebar-fg:#3a3f47;
  --hover:#efe9df; --shadow:0 1px 3px rgba(0,0,0,.06);
}
html[data-theme="dark"]{
  --bg:#16181d; --fg:#d7dae0; --muted:#9aa3af; --accent:#e0a458;
  --accent-soft:#2a2418; --border:#2c3038; --code-bg:#1f232b;
  --quote-bg:#1c2027; --sidebar-bg:#121419; --sidebar-fg:#c2c8d2;
  --hover:#21262f; --shadow:0 1px 3px rgba(0,0,0,.4);
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--bg); color:var(--fg);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans CJK SC",
    "Source Han Sans SC","PingFang SC","Microsoft YaHei",sans-serif;
  font-size:17px; line-height:1.85; -webkit-font-smoothing:antialiased;
}
a{color:var(--accent); text-decoration:none}
a:hover{text-decoration:underline}

/* progress bar */
#progress{position:fixed; top:0; left:0; height:3px; width:0%;
  background:var(--accent); z-index:60; transition:width .1s linear}

/* sidebar */
#sidebar{
  position:fixed; top:0; left:0; width:300px; height:100vh;
  background:var(--sidebar-bg); color:var(--sidebar-fg);
  border-right:1px solid var(--border); overflow-y:auto;
  padding:22px 0 60px; z-index:50;
}
#sidebar .brand{
  font-size:18px; font-weight:700; padding:0 22px 14px;
  border-bottom:1px solid var(--border); margin-bottom:10px; line-height:1.4;
}
#sidebar .brand small{display:block; font-weight:400; font-size:12px;
  color:var(--muted); margin-top:4px}
#toc{font-size:14px}
#toc ul{list-style:none; margin:0; padding:0}
#toc li{margin:0}
#toc a{
  display:block; padding:5px 22px; color:var(--sidebar-fg);
  border-left:3px solid transparent; line-height:1.5;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
#toc a:hover{background:var(--hover); text-decoration:none}
#toc a.active{
  color:var(--accent); border-left-color:var(--accent);
  background:var(--accent-soft); font-weight:600;
}
#toc ul ul a{padding-left:36px; font-size:13.5px}
#toc ul ul ul a{padding-left:50px; font-size:13px; color:var(--muted)}

/* content */
#content{margin-left:300px; padding:46px 32px 120px}
.article{max-width:840px; margin:0 auto}
.article h1{font-size:30px; line-height:1.35; margin:0 0 6px;
  border-bottom:3px solid var(--accent); padding-bottom:14px}
.article h2{font-size:24px; margin:52px 0 16px; padding-top:10px;
  border-top:1px solid var(--border); padding-top:24px}
.article h3{font-size:20px; margin:34px 0 12px; color:var(--fg)}
.article h4{font-size:17px; margin:24px 0 10px; color:var(--muted);
  font-weight:600}
.article h1,h2,h3,h4{scroll-margin-top:20px; line-height:1.4}
.article p{margin:14px 0}
.article ul,.article ol{padding-left:26px; margin:14px 0}
.article li{margin:6px 0}
.article blockquote{
  margin:18px 0; padding:12px 18px; border-left:4px solid var(--accent);
  background:var(--quote-bg); border-radius:0 6px 6px 0; color:var(--muted);
}
.article blockquote p{margin:8px 0}
.article code{
  background:var(--code-bg); padding:.15em .4em; border-radius:4px;
  font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;
  font-size:.88em}
.article pre{background:var(--code-bg); padding:14px 16px; border-radius:8px;
  overflow-x:auto}
.article pre code{background:none; padding:0}
.article hr{border:none; border-top:1px solid var(--border); margin:34px 0}
.article table{border-collapse:collapse; margin:16px 0}
.article th,.article td{border:1px solid var(--border); padding:6px 10px}
.math-block{overflow-x:auto; overflow-y:hidden; margin:18px 0;
  text-align:center; font-size:1.02em}
.article img{max-width:100%; height:auto; display:block; margin:18px auto;
  border:1px solid var(--border); border-radius:8px; box-shadow:var(--shadow)}
mjx-container{outline:none}

/* 色块 / callout（参考原站：问题=琥珀, 解答=青柠；另补 定理 / 定义） */
.callout{margin:18px 0; padding:13px 17px; border-radius:8px;
  border-left:5px solid; line-height:1.8}
.callout p{margin:6px 0}
.callout p:first-child{margin-top:0}
.callout p:last-child{margin-bottom:0}
.callout strong{font-weight:700}
.callout-problem{background:#fdf3d7; border-color:#e0a458}
.callout-problem strong{color:#a9690f}
.callout-solution{background:#e9f7ec; border-color:#3fa45b}
.callout-solution strong{color:#1f7a3c}
.callout-theorem{background:#e7f0fb; border-color:#3b7dd8}
.callout-theorem strong{color:#1f5bb5}
.callout-definition{background:#efeafb; border-color:#7c5cd6}
.callout-definition strong{color:#5a36b0}
html[data-theme="dark"] .callout-problem{background:#2e2716; border-color:#c98f3a}
html[data-theme="dark"] .callout-problem strong{color:#e8b566}
html[data-theme="dark"] .callout-solution{background:#16271b; border-color:#3fa45b}
html[data-theme="dark"] .callout-solution strong{color:#74c98c}
html[data-theme="dark"] .callout-theorem{background:#16202e; border-color:#3b7dd8}
html[data-theme="dark"] .callout-theorem strong{color:#7aa6e6}
html[data-theme="dark"] .callout-definition{background:#211c2e; border-color:#7c5cd6}
html[data-theme="dark"] .callout-definition strong{color:#b39ae8}

/* controls */
#topbar{position:fixed; top:10px; right:14px; z-index:55; display:flex; gap:8px}
#topbar button{
  background:var(--sidebar-bg); color:var(--fg); border:1px solid var(--border);
  border-radius:8px; width:38px; height:38px; cursor:pointer; font-size:16px;
  box-shadow:var(--shadow)}
#topbar button:hover{background:var(--hover)}
#menu-btn{display:none}

/* mobile */

/* 正文外链 -> 点击直接在新标签页打开 */
.lp-link{color:var(--accent); text-decoration:underline; cursor:pointer; word-break:break-all}
.lp-link::after{content:"↗"; font-size:.72em; margin-left:2px; vertical-align:super; opacity:.7}
.lp-link:hover{opacity:.82}

@media (max-width:900px){
  #sidebar{transform:translateX(-100%); transition:transform .25s ease;
    box-shadow:2px 0 12px rgba(0,0,0,.2)}
  body.nav-open #sidebar{transform:translateX(0)}
  #content{margin-left:0; padding:60px 18px 100px}
  #menu-btn{display:block}
  #toc a{white-space:normal}
}
"""

JS = r"""
(function(){
  var html=document.documentElement;
  // theme
  var saved=localStorage.getItem('theme');
  if(saved) html.setAttribute('data-theme',saved);
  else if(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)
    html.setAttribute('data-theme','dark');
  document.getElementById('theme-btn').onclick=function(){
    var cur=html.getAttribute('data-theme')==='dark'?'light':'dark';
    html.setAttribute('data-theme',cur); localStorage.setItem('theme',cur);
  };
  // build TOC
  var heads=document.querySelectorAll('#content h2, #content h3, #content h4');
  var toc=document.getElementById('toc');
  var root=document.createElement('ul'); toc.appendChild(root);
  var cur2=null, cur3=null;
  heads.forEach(function(h){
    var txt=h.textContent.trim();
    if(txt==='目录') return;               // skip the in-doc TOC section
    var li=document.createElement('li');
    var a=document.createElement('a');
    a.href='#'+h.id; a.textContent=txt;
    li.appendChild(a);
    if(h.tagName==='H2'){ root.appendChild(li); cur2=li; cur3=null; }
    else if(h.tagName==='H3'){
      if(!cur2){ root.appendChild(li); cur2=li; }
      var ul=cur2.querySelector('ul'); if(!ul){ ul=document.createElement('ul'); cur2.appendChild(ul); }
      ul.appendChild(li); cur3=li;
    } else {
      var parent=cur3||cur2; if(!parent) parent=root; // h4 under h3
      var ul2=parent.querySelector('ul'); if(!ul2){ ul2=document.createElement('ul'); parent.appendChild(ul2); }
      ul2.appendChild(li);
    }
  });
  var links=toc.querySelectorAll('a');
  // smooth scroll + close mobile nav
  links.forEach(function(a){
    a.addEventListener('click',function(e){
      var id=a.getAttribute('href').slice(1);
      var el=document.getElementById(id);
      if(el){ e.preventDefault(); el.scrollIntoView({behavior:'smooth',block:'start'});
        history.replaceState(null,'','#'+id);
        document.body.classList.remove('nav-open'); }
    });
  });
  // scroll-spy
  var map={}; links.forEach(function(a){ map[a.getAttribute('href').slice(1)]=a; });
  function setActive(id){
    links.forEach(function(a){ a.classList.remove('active'); });
    if(map[id]) map[id].classList.add('active');
  }
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting) setActive(en.target.id);
    });
  },{rootMargin:'-10% 0px -75% 0px',threshold:0});
  heads.forEach(function(h){ io.observe(h); });
  if(heads[0]) setActive(heads[0].id);
  // progress bar
  var bar=document.getElementById('progress');
  function onScroll(){
    var h=document.documentElement;
    var max=h.scrollHeight-h.clientHeight;
    bar.style.width=(max>0?(h.scrollTop/max*100):0)+'%';
  }
  window.addEventListener('scroll',onScroll,{passive:true}); onScroll();
  // mobile menu
  document.getElementById('menu-btn').onclick=function(){
    document.body.classList.toggle('nav-open');
  };
})();

(function(){
  // 正文中的纯文本外链 -> 包裹为可点击链接，点击弹出预览（不立即跳转）
  var ROOT = document.querySelector('#content .article');
  if (ROOT) {
    var URL_RE = new RegExp("https?://[^\\s<>\"']+", "gi");
    var TRAIL = new RegExp("[.,;:。，、；：）)】」\\s]$");
    function safeParent(p){
      if(!p) return false;
      var t=(p.tagName||'').toLowerCase();
      if(t==='a'||t==='code'||t==='pre'||t==='script'||t==='style') return false;
      if(p.closest && (p.closest('.math-block')||p.closest('mjx-container')||p.closest('pre')||p.closest('code'))) return false;
      return true;
    }
    var walker=document.createTreeWalker(ROOT, NodeFilter.SHOW_TEXT, {
      acceptNode:function(n){
        if(!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if(!new RegExp("https?://","i").test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        return safeParent(n.parentNode) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var textNodes=[], node;
    while((node=walker.nextNode())) textNodes.push(node);
    textNodes.forEach(function(textNode){
      var txt=textNode.nodeValue, frag=document.createDocumentFragment(), last=0, m;
      URL_RE.lastIndex=0;
      while((m=URL_RE.exec(txt))){
        var url=m[0];
        while(TRAIL.test(url)) url=url.slice(0,-1);
        if(m.index>last) frag.appendChild(document.createTextNode(txt.slice(last,m.index)));
        var a=document.createElement('a');
        a.className='lp-link'; a.href=url;
        a.target='_blank'; a.rel='noopener noreferrer';
        a.textContent=url;
        frag.appendChild(a);
        last=m.index+m[0].length;
      }
      if(last<txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
      textNode.parentNode.replaceChild(frag,textNode);
    });
  }
})();

"""

# extract title text for <title> and brand
m = re.search(r"^#\s+(.*)$", raw, re.MULTILINE)
title = m.group(1) if m else "形式幂级数讲解"
brand = title

MATHJAX_CFG = """
window.MathJax = {
  tex: {
    inlineMath: [['$','$'],['\\\\(','\\\\)']],
    displayMath: [['$$','$$'],['\\\\[','\\\\]']],
    macros: {
      pmat: ['\\\\begin{pmatrix}#1\\\\end{pmatrix}', 1],
      dp:   ['\\\\mathrm{dp}#1', 1],
      C: '\\\\mathbb{C}', Q: '\\\\mathbb{Q}',
      R: '\\\\mathbb{R}', Z: '\\\\mathbb{Z}', N: '\\\\mathbb{N}'
    }
  },
  options: { skipHtmlTags: ['script','noscript','style','textarea','pre','code'] },
  svg: { fontCache: 'global' }
};
"""

doc = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>__CSS__</style>
<script>__MJCFG__</script>
<script id="MathJax-script" async
  src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</head>
<body>
<div id="progress"></div>
<div id="topbar">
  <button id="menu-btn" title="目录">&#9776;</button>
  <button id="theme-btn" title="切换主题">&#9728;</button>
</div>
<aside id="sidebar">
  <div class="brand">__BRAND__<small>maspy 博客中文翻译</small></div>
  <nav id="toc"></nav>
</aside>
<main id="content">
  <article class="article">
__BODY__
  </article>
</main>
<script>__JS__</script>
</body>
</html>
"""

doc = (doc.replace("__TITLE__", title)
          .replace("__BRAND__", brand)
          .replace("__CSS__", CSS)
          .replace("__MJCFG__", MATHJAX_CFG)
          .replace("__BODY__", body)
          .replace("__JS__", JS))

with open(OUT, "w", encoding="utf-8") as f:
    f.write(doc)

# ---- validation ----
left = body.count("@@MATH")
hcount = len(re.findall(r'<h[1-4] id="', body))
no_id = len(re.findall(r'<h[1-4](?!\s+id=)', body))
anchor_left = body.count("<a id=")
print("written:", OUT)
print("headings with id:", hcount, "| headings without id:", no_id)
print("math placeholders remaining:", left)
print("stray <a id= left:", anchor_left)
print("$$ count (should be even):", body.count("$$"))
