#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_catalog.py — 生成 article/cf/cf-catalog.html 的工具。

本工具只处理 article/cf 目录（即本脚本所在目录），流程分为三步：

  1. fetch  ：用 urllib 下载 https://codeforces.com/catalog 并缓存为 catalog_raw.html
  2. parse  ：解析目录树，生成元数据索引 catalog.json
  3. build  ：读取 catalog.json，生成可交互的 cf-catalog.html
             （多维分面筛选：分类目录树逐级展开 + 年份 + 作者；表格/卡片视图）

设计要点（与 article/gen_index.py 保持一致）：
  * 纯标准库，零第三方依赖。
  * BASE_DIR 取脚本所在目录，所有读写限定在 cf/ 内，不触碰上级工程。

页面真实结构（Codeforces Catalog）：
  * 目录树容器：<div class="_CatalogViewFrame_catalog">
  * 每个节点：<div class="_catalogNode">
      - 文件夹：<div class="_catalogFolder"> … <span class="_catalogFolderName">名称</span>
                后跟 <ul class="_children"> 容纳子节点
      - 文章：  <div class="_catalogBlogEntry">
                标题：<a href="/blog/entry/..."><span class="_nameContent">标题</span></a>
                作者：<a href="/profile/..." title="等级 用户名" class="rated-user ...">用户名</a>
                时间：<span class="format-humantime" title="Oct/26/2018 12:31">8 years ago</span>
                描述：<small>...</small>
  * 变更历史侧栏：<div class="_CatalogHistorySidebarFrame_history"> …（含 blog 链接，需跳过）

用法：
  python build_catalog.py                 # 等价于 fetch -> parse -> build
  python build_catalog.py fetch           # 仅下载并缓存原始页面
  python build_catalog.py parse           # 仅解析原始页面为 catalog.json
  python build_catalog.py build           # 仅生成 cf-catalog.html
  python build_catalog.py stats           # 打印统计信息
"""

import argparse
import datetime
import html
import json
import os
import re
import sys
import urllib.request
from html.parser import HTMLParser

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_FILE = os.path.join(BASE_DIR, "catalog_raw.html")
JSON_FILE = os.path.join(BASE_DIR, "catalog.json")
OUTPUT = os.path.join(BASE_DIR, "cf-catalog.html")

SOURCE_URL = "https://codeforces.com/catalog"
CF_BASE = "https://codeforces.com"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


# --------------------------------------------------------------------------
# fetch
# --------------------------------------------------------------------------
def cmd_fetch():
    print(f"[fetch] 下载 {SOURCE_URL}")
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
    except Exception as e:  # noqa: BLE001
        print(f"[error] 下载失败：{e}", file=sys.stderr)
        return 1
    with open(RAW_FILE, "wb") as f:
        f.write(data)
    size = len(data)
    print(f"[ok] 已缓存原始页面 -> {os.path.relpath(RAW_FILE, BASE_DIR)} "
          f"({size} bytes)")
    return 0


# --------------------------------------------------------------------------
# parse
# --------------------------------------------------------------------------
class CatalogParser(HTMLParser):
    """解析 Codeforces Catalog 的分层目录树。

    利用特定的 class 标记还原分类路径（Tag）：
      * 进入 <div class="_catalogFolder"> 后，从 <span class="_catalogFolderName">
        读取分类名；遇到其 <ul class="_children"> 时把该分类名压入 category_stack。
      * 离开该 <ul> 时出栈。
      * 遇到 <div class="_catalogBlogEntry"> 收一条文章，tags 取当前 category_stack。
    同时跳过变更历史侧栏（class 含 "history"）。
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.articles = []
        self.category_stack = []
        self.pending_folder = None

        # 状态机
        self.div_depth = 0
        self.in_history = False
        self.history_depth = 0
        self.in_entry = False
        self.entry_depth = 0
        self.cur_entry = None

        # 捕获辅助
        self.in_folder_name = False
        self.cap_title = False
        self.cap_title_span = False
        self.title_span_done = False
        self.cap_author = False
        self.cap_time = False
        self.cap_desc = False
        self.cur_anchor = None
        self.ul_stack = []  # 与嵌套 <ul> 配对，记录是否为 _children

    # -- html.parser 回调 --
    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        cls = attrs_d.get("class", "")
        tag = tag.lower()
        href = attrs_d.get("href", "")
        title_attr = attrs_d.get("title", "")

        if tag == "div":
            self.div_depth += 1
            if "history" in cls and not self.in_history:
                self.in_history = True
                self.history_depth = self.div_depth
            if self.in_history:
                return
            if "_catalogBlogEntry" in cls:
                self.in_entry = True
                self.entry_depth = self.div_depth
                self.cur_entry = {
                    "title": "", "link": "", "author": "",
                    "author_level": "", "time_raw": "", "time_abs": "",
                    "description": "",
                }
            elif "_catalogFolder" in cls:
                self.in_folder_name = False  # 等待 _catalogFolderName span
            return

        if self.in_history:
            return

        if tag == "ul":
            is_children = "_children" in cls
            self.ul_stack.append(is_children)
            if is_children and self.pending_folder:
                self.category_stack.append(self.pending_folder)
                self.pending_folder = None
            return

        if tag == "span":
            if "_catalogFolderName" in cls:
                self.in_folder_name = True
            elif "format-humantime" in cls:
                self.cap_time = True
                self.cur_entry["time_abs"] = title_attr.strip()
            elif "_nameContent" in cls and self.cap_title and not self.title_span_done:
                self.cap_title_span = True
                self.title_span_done = True
            return

        if tag == "small":
            if self.in_entry:
                self.cap_desc = True
            return

        if tag == "a":
            if "/blog/entry" in href and self.in_entry:
                self.cap_title = True
                self.title_span_done = False
                self.cur_entry["link"] = href.strip()
            elif "/profile/" in href and self.in_entry:
                self.cap_author = True
                self.cur_entry["author_level"] = title_attr.strip()
            if self.in_entry:
                self.cur_anchor = {"href": href, "title": title_attr, "text": ""}

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "div":
            if self.in_entry and self.div_depth == self.entry_depth:
                self._emit()
                self.in_entry = False
                self.cur_entry = None
            if self.in_history and self.div_depth == self.history_depth:
                self.in_history = False
            self.div_depth -= 1
            return
        if self.in_history:
            return
        if tag == "ul":
            if self.ul_stack:
                is_children = self.ul_stack.pop()
                if is_children and self.category_stack:
                    self.category_stack.pop()
            return
        if tag == "span":
            if self.in_folder_name:
                self.in_folder_name = False
            if self.cap_time:
                self.cap_time = False
            if self.cap_title_span:
                self.cap_title_span = False
            return
        if tag == "small":
            self.cap_desc = False
            return
        if tag == "a":
            self.cur_anchor = None
            self.cap_title = False
            self.cap_author = False
            return

    def handle_data(self, data):
        if self.in_history:
            return
        if self.in_folder_name:
            self.pending_folder = (self.pending_folder or "") + data
        if self.in_entry:
            if self.cap_title_span:
                self.cur_entry["title"] += data
            if self.cap_author:
                self.cur_entry["author"] += data
            if self.cap_time:
                self.cur_entry["time_raw"] += data
            if self.cap_desc:
                self.cur_entry["description"] += data

    # -- 解析辅助 --
    def _emit(self):
        e = self.cur_entry
        title = e["title"].strip()
        link = e["link"].strip()
        if link.startswith("/"):
            link = CF_BASE + link

        author = e["author"].strip()
        author_level = e["author_level"]
        if author and author_level:
            lv = re.sub(r"\s*" + re.escape(author) + r"\s*$", "",
                        author_level).strip()
            author_level = lv or author_level

        year = self._year_from_abs(e["time_abs"])
        time_raw = e["time_raw"].strip() or e["time_abs"]

        desc = re.sub(r"\s+", " ", e["description"]).strip()
        tags = list(self.category_stack)
        tags_str = " / ".join(tags)

        self.articles.append({
            "title": title,
            "link": link,
            "author": author,
            "author_level": author_level,
            "time_raw": time_raw,
            "year": year,
            "description": desc,
            "tags": tags,
            "tags_str": tags_str,
        })

    @staticmethod
    def _year_from_abs(abs_str):
        if not abs_str:
            return None
        m = re.search(r"(\w{3})/(\d{1,2})/(\d{4})", abs_str)
        if not m:
            return None
        return int(m.group(3))


def _extract_server_time(text):
    m = re.search(r"Server time:\s*<span[^>]*>([^<]+)</span>", text)
    if m:
        return m.group(1).strip()
    m = re.search(r"Server time:\s*([A-Za-z]{3}/\d{1,2}/\d{4}\s+[\d:]+)", text)
    if m:
        return m.group(1).strip()
    return "unknown"


def cmd_parse():
    if not os.path.isfile(RAW_FILE):
        print(f"[error] 找不到 {RAW_FILE}，请先运行 fetch", file=sys.stderr)
        return 1
    with open(RAW_FILE, "r", encoding="utf-8", errors="ignore") as f:
        raw = f.read()

    server_time = _extract_server_time(raw)

    parser = CatalogParser()
    parser.feed(raw)
    parser.close()

    # 去重（按 link），年份缺失的排到最后；丢弃无链接/无标题的占位条目
    seen = {}
    for art in parser.articles:
        if not art["link"] or not art["title"].strip():
            continue
        if art["link"] not in seen:
            seen[art["link"]] = art
    articles = list(seen.values())
    articles.sort(key=lambda a: (-(a["year"] or 0), a["title"].lower()))

    catalog = {
        "updated": datetime.date.today().isoformat(),
        "server_time": server_time,
        "source": SOURCE_URL,
        "count": len(articles),
        "articles": articles,
    }
    with open(JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    print(f"[ok] 已解析 {len(articles)} 篇文章 -> "
          f"{os.path.relpath(JSON_FILE, BASE_DIR)}")
    return 0


def cmd_stats():
    if not os.path.isfile(JSON_FILE):
        print("[error] 找不到 catalog.json，请先运行 parse", file=sys.stderr)
        return 1
    with open(JSON_FILE, encoding="utf-8") as f:
        catalog = json.load(f)
    arts = catalog["articles"]
    years = [a["year"] for a in arts if a["year"]]
    authors = {a["author"] for a in arts if a["author"]}
    top = {t[0] for a in arts for t in [a["tags"]] if t}
    print(f"文章总数 : {len(arts)}")
    print(f"作者数量 : {len(authors)}")
    print(f"顶级分类 : {len(top)}")
    if years:
        print(f"年份范围 : {min(years)} ~ {max(years)}")
    return 0


# --------------------------------------------------------------------------
# build
# --------------------------------------------------------------------------
def cmd_build():
    if not os.path.isfile(JSON_FILE):
        print(f"[error] 找不到 {JSON_FILE}，请先运行 parse", file=sys.stderr)
        return 1
    with open(JSON_FILE, encoding="utf-8") as f:
        catalog = json.load(f)

    data_json = json.dumps(catalog, ensure_ascii=False)

    doc = _render_html(data_json, catalog)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(doc)
    print(f"[ok] 已生成 {os.path.relpath(OUTPUT, BASE_DIR)} "
          f"({catalog['count']} 篇文章)")
    return 0


def _render_html(data_json, catalog):
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <title>Codeforces 教程目录 · CF Catalog</title>
  <style>
    :root {{
      --bg: #0f1115;
      --panel: rgba(23, 26, 33, 0.72);
      --border: #2a2f3a;
      --text: #e6e8ec;
      --muted: #9aa3b2;
      --accent: #4f8cff;
      --accent-2: #6ee7b7;
      --glass: rgba(255, 255, 255, 0.04);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "PingFang SC", -apple-system, BlinkMacSystemFont, "Segoe UI",
        "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background:
        radial-gradient(1200px 600px at 80% -10%, rgba(79,140,255,0.12), transparent 60%),
        radial-gradient(900px 500px at -10% 10%, rgba(110,231,183,0.10), transparent 55%),
        var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }}
    .app-header {{
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; padding: 18px 28px;
      background: var(--panel);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap; position: sticky; top: 0; z-index: 30;
    }}
    .app-header h1 {{ font-size: 20px; margin: 0; letter-spacing: .3px; }}
    .app-header h1 .dot {{ color: var(--accent); margin-right: 8px; }}
    .header-right {{ display: flex; align-items: center; gap: 16px; }}
    .header-right a {{ color: var(--muted); text-decoration: none; font-size: 14px; }}
    .header-right a:hover {{ color: var(--accent); }}

    main {{ max-width: 1280px; margin: 0 auto; padding: 22px 28px 60px; }}

    .toolbar {{
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
      margin: 16px 0 18px;
    }}
    .search {{
      flex: 1 1 280px; min-width: 200px;
      background: var(--glass); border: 1px solid var(--border);
      border-radius: 10px; padding: 10px 14px; color: var(--text);
      font-size: 14px; outline: none; transition: border-color .15s;
    }}
    .search:focus {{ border-color: var(--accent); }}
    .view-toggle {{
      display: inline-flex; background: var(--glass);
      border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
    }}
    .view-toggle button {{
      background: transparent; border: 0; color: var(--muted);
      padding: 10px 16px; font-size: 14px; cursor: pointer; transition: .15s;
    }}
    .view-toggle button.active {{
      background: linear-gradient(135deg, var(--accent), #6aa0ff);
      color: #fff;
    }}
    .count-pill {{
      font-size: 13px; color: var(--muted);
      background: var(--glass); border: 1px solid var(--border);
      border-radius: 999px; padding: 6px 14px; white-space: nowrap;
    }}

    /* 两栏：左侧筛选 / 右侧结果 */
    .layout {{
      display: grid; grid-template-columns: 300px 1fr; gap: 26px;
      align-items: start;
    }}
    .sidebar {{
      position: sticky; top: 86px; align-self: start;
      max-height: calc(100vh - 106px); overflow-y: auto;
      display: flex; flex-direction: column; gap: 18px; padding-right: 6px;
    }}
    .sidebar::-webkit-scrollbar {{ width: 8px; }}
    .sidebar::-webkit-scrollbar-thumb {{ background: var(--border); border-radius: 8px; }}
    .facet {{
      background: var(--panel); border: 1px solid var(--border);
      border-radius: 14px; padding: 14px 16px;
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    }}
    .facet-head {{
      display: flex; align-items: center; justify-content: space-between;
      font-size: 13px; font-weight: 600; color: var(--text);
      margin-bottom: 10px; letter-spacing: .3px;
    }}
    .facet-clear {{ font-weight: 400; font-size: 12px; color: var(--accent);
      cursor: pointer; user-select: none; }}
    .facet-clear:hover {{ text-decoration: underline; }}

    /* 目录树（逐级展开 / 多维筛选） */
    .tree {{ display: flex; flex-direction: column; }}
    .tree-row {{
      display: flex; align-items: center; gap: 6px;
      padding: 5px 8px; border-radius: 8px; cursor: pointer;
      transition: background .12s;
    }}
    .tree-row:hover {{ background: var(--glass); }}
    .tree-row.selected {{ background: rgba(79,140,255,0.16); }}
    .tree-row.selected .tree-label {{ color: var(--accent); font-weight: 600; }}
    .twisty {{
      width: 14px; text-align: center; color: var(--muted);
      font-size: 11px; user-select: none; flex: none; cursor: pointer;
    }}
    .twisty.leaf {{ visibility: hidden; }}
    .tree-cb {{ accent-color: var(--accent); flex: none; margin: 0 2px 0 0; cursor: pointer; }}
    .tree-label {{
      flex: 1; font-size: 13.5px; color: var(--text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }}
    .tree-count {{
      font-size: 11.5px; color: var(--muted);
      font-variant-numeric: tabular-nums; flex: none;
    }}

    /* 分面列表（年份 / 作者） */
    .facet-list {{ display: flex; flex-direction: column; gap: 2px; }}
    .facet-list.collapsed {{ max-height: 320px; overflow-y: auto; }}
    .facet-list.expanded {{ max-height: 60vh; overflow-y: auto; }}
    .facet-item {{
      display: flex; align-items: center; gap: 8px;
      padding: 4px 8px; border-radius: 8px; cursor: pointer; font-size: 13.5px;
    }}
    .facet-item:hover {{ background: var(--glass); }}
    .facet-item.selected .facet-name {{ color: var(--accent); font-weight: 600; }}
    .facet-item input {{ accent-color: var(--accent); flex: none; }}
    .facet-name {{
      flex: 1; color: var(--text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }}
    .facet-count {{ font-size: 11.5px; color: var(--muted);
      font-variant-numeric: tabular-nums; flex: none; }}

    /* 已选筛选条件 */
    .active-filters {{ display: none; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }}
    .active-filters.show {{ display: flex; }}
    .chip {{
      font-size: 12.5px; color: var(--muted); cursor: pointer;
      background: var(--glass); border: 1px solid var(--border);
      border-radius: 999px; padding: 5px 12px; white-space: nowrap;
      transition: transform .12s, border-color .15s, color .15s, background .15s;
    }}
    .chip:hover {{ transform: translateY(-1px); color: var(--text); border-color: var(--accent); }}
    .chip.clear {{ color: var(--accent); }}

    /* 表格视图 */
    .table-wrap {{ overflow-x: auto; border-radius: 12px; border: 1px solid var(--border); }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    thead th {{
      text-align: left; padding: 12px 14px; color: var(--muted);
      font-weight: 600; border-bottom: 1px solid var(--border);
      background: rgba(255,255,255,0.03); position: sticky; top: 0;
    }}
    tbody td {{ padding: 12px 14px; border-bottom: 1px solid rgba(42,47,58,0.6);
      vertical-align: top; }}
    tbody tr:hover {{ background: rgba(79,140,255,0.06); }}
    tbody tr:last-child td {{ border-bottom: 0; }}
    td a.title {{ color: var(--text); text-decoration: none; font-weight: 600; }}
    td a.title:hover {{ color: var(--accent); }}
    .author {{ color: var(--accent-2); }}
    .year {{ color: var(--muted); font-variant-numeric: tabular-nums; }}
    .tagpath {{ color: var(--muted); font-size: 12.5px; }}
    .tagpath b {{ color: var(--text); font-weight: 600; }}

    /* 卡片视图 */
    .cards {{ display: grid; gap: 16px;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }}
    .card {{
      background: var(--panel); backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid var(--border); border-radius: 14px;
      padding: 16px 18px; transition: transform .15s, border-color .15s;
      display: flex; flex-direction: column; gap: 8px;
    }}
    .card:hover {{ transform: translateY(-3px); border-color: var(--accent); }}
    .card h3 {{ margin: 0; font-size: 16px; }}
    .card h3 a {{ color: var(--text); text-decoration: none; }}
    .card h3 a:hover {{ color: var(--accent); }}
    .card .meta {{ display: flex; gap: 10px; align-items: center;
      flex-wrap: wrap; font-size: 13px; color: var(--muted); }}
    .badge {{
      font-size: 11.5px; color: var(--accent-2);
      border: 1px solid rgba(110,231,183,0.4); border-radius: 6px; padding: 1px 7px;
    }}
    .card .desc {{ font-size: 13px; color: var(--muted); }}
    .card .tags {{ display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }}
    .card .tags span {{
      font-size: 11.5px; color: var(--muted);
      background: var(--glass); border: 1px solid var(--border);
      border-radius: 6px; padding: 1px 8px;
    }}
    .empty {{ text-align: center; color: var(--muted); padding: 60px 0; }}

    footer {{ max-width: 1280px; margin: 0 auto; padding: 0 28px 40px;
      color: var(--muted); font-size: 12px; }}
    .fade {{ animation: fade .25s ease; }}
    @keyframes fade {{ from {{ opacity: 0; transform: translateY(4px); }}
      to {{ opacity: 1; transform: none; }} }}

    @media (max-width: 860px) {{
      .layout {{ grid-template-columns: 1fr; }}
      .sidebar {{ position: static; max-height: none; }}
    }}
  </style>
</head>
<body>
  <header class="app-header">
    <h1><span class="dot">◆</span>Codeforces 教程目录</h1>
    <div class="header-right">
      <a href="../index.html" rel="noopener noreferrer">← 返回主站</a>
      <a href="https://codeforces.com/catalog" target="_blank" rel="noopener noreferrer">CF Catalog</a>
    </div>
  </header>

    <main>
      <div class="toolbar">
        <input id="search" class="search" type="text" placeholder="搜索标题 / 作者 / 分类 …" />
        <div class="view-toggle" id="viewToggle">
          <button data-view="table" class="active">表格</button>
          <button data-view="cards">卡片</button>
        </div>
        <span class="count-pill" id="countPill">0 篇</span>
      </div>

      <div class="layout">
        <aside class="sidebar">
          <div class="facet">
            <div class="facet-head">
              分类目录（点开展开下级）<span class="facet-clear" id="catClear">重置</span>
            </div>
            <div class="tree" id="tree"></div>
          </div>
          <div class="facet">
            <div class="facet-head">年份</div>
            <div class="facet-list collapsed" id="yearList"></div>
          </div>
          <div class="facet">
            <div class="facet-head">
              作者<span class="facet-clear" id="authorToggle">展开全部</span>
            </div>
            <div class="facet-list collapsed" id="authorList"></div>
          </div>
        </aside>

        <section class="content">
          <div class="active-filters" id="activeFilters"></div>
          <div id="result"></div>
        </section>
      </div>
    </main>

    <footer>
      数据来源 {html.escape(catalog.get("source", SOURCE_URL))} ·
      服务器时间 {html.escape(str(catalog.get("server_time", "")))} ·
      由 build_catalog.py 自动生成 · 最后更新 {now}
    </footer>

    <script>
    const CATALOG = {data_json};
    const articles = CATALOG.articles || [];

    const state = {{
      view: "table",
      cats: new Set(),
      years: new Set(),
      authors: new Set(),
      query: ""
    }};
    const expanded = new Set();
    let showAllAuthors = false;

    // ---- 由 tags 数组构建分类目录树 ----
    const root = {{ name: "__root__", children: new Map(), count: 0 }};
    articles.forEach(function(a) {{
      let node = root;
      node.count++;
      (a.tags || []).forEach(function(t) {{
        if (!node.children.has(t)) node.children.set(t, {{ name: t, children: new Map(), count: 0 }});
        node = node.children.get(t);
        node.count++;
      }});
    }});

    // ---- 多维匹配（各维度单选，维度间 AND；分类仅匹配当前级别，不含子级） ----
    function matchCat(a) {{
      if (state.cats.size === 0) return true;
      return a.tags_str === [...state.cats][0];
    }}
    function matchYear(a) {{ return state.years.size === 0 || state.years.has(a.year); }}
    function matchAuthor(a) {{ return state.authors.size === 0 || state.authors.has(a.author); }}
    function matchQuery(a) {{
      if (!state.query) return true;
      const q = state.query.toLowerCase();
      return (a.title + " " + (a.author || "") + " " + (a.tags_str || "")).toLowerCase().includes(q);
    }}
    function matchesOther(a, dim) {{
      if (dim !== "cat" && !matchCat(a)) return false;
      if (dim !== "year" && !matchYear(a)) return false;
      if (dim !== "author" && !matchAuthor(a)) return false;
      if (dim !== "query" && !matchQuery(a)) return false;
      return true;
    }}
    function matches(a) {{ return matchCat(a) && matchYear(a) && matchAuthor(a) && matchQuery(a); }}

    // 某分类路径下的文章数（精确当前级别，不含子级；受其它维度影响，实现分面计数）
    function nodeCount(p) {{
      let c = 0;
      for (const a of articles) {{
        if (matchesOther(a, "cat") && a.tags_str === p) c++;
      }}
      return c;
    }}

    const treeEl = document.getElementById("tree");
    function buildTree() {{
      treeEl.innerHTML = "";
      root.children.forEach(function(child) {{
        treeEl.appendChild(renderNode(child, child.name, 0));
      }});
    }}
    function toggleExpand(path) {{
      if (expanded.has(path)) expanded.delete(path); else expanded.add(path);
      buildTree();
    }}
    function toggleSelect(path) {{
      // 单选：再次点击同一项则取消，否则清空后仅选当前项
      if (state.cats.has(path)) state.cats.clear();
      else {{ state.cats.clear(); state.cats.add(path); }}
      buildTree(); renderActive(); render();
    }}

    function renderNode(node, path, depth) {{
      const wrap = document.createElement("div");
      const row = document.createElement("div");
      row.className = "tree-row" + (state.cats.has(path) ? " selected" : "");
      row.style.paddingLeft = (10 + depth * 16) + "px";

      const hasKids = node.children.size > 0;
      const isOpen = expanded.has(path);

      const tw = document.createElement("span");
      tw.className = "twisty" + (hasKids ? "" : " leaf");
      tw.textContent = hasKids ? (isOpen ? "▾" : "▸") : "";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "tree-cb";
      cb.checked = state.cats.has(path);

      const label = document.createElement("span");
      label.className = "tree-label";
      label.textContent = node.name;

      const cnt = document.createElement("span");
      cnt.className = "tree-count";
      cnt.textContent = nodeCount(path);

      // 点击箭头 → 展开/收起下级
      tw.onclick = function(e) {{ e.stopPropagation(); toggleExpand(path); }};
      if (hasKids) {{
        // 点击行内空白区域 → 展开/收起下级
        row.onclick = function(e) {{
          if (e.target === cb || e.target === label || e.target === tw) return;
          toggleExpand(path);
        }};
      }}
      // 复选框与标题文字 → 选中/取消该分类筛选
      cb.onchange = function() {{ toggleSelect(path); }};
      label.onclick = function(e) {{ e.stopPropagation(); toggleSelect(path); }};

      row.appendChild(tw);
      row.appendChild(cb);
      row.appendChild(label);
      row.appendChild(cnt);
      wrap.appendChild(row);

      if (hasKids && isOpen) {{
        node.children.forEach(function(c) {{
          wrap.appendChild(renderNode(c, path + " / " + c.name, depth + 1));
        }});
      }}
      return wrap;
    }}

    const yearEl = document.getElementById("yearList");
    function buildYears() {{
      yearEl.innerHTML = "";
      const ys = [], seen = new Set();
      articles.forEach(function(a) {{ if (a.year && !seen.has(a.year)) {{ seen.add(a.year); ys.push(a.year); }} }});
      ys.sort(function(a, b) {{ return b - a; }});
      ys.forEach(function(y) {{
        const row = document.createElement("label");
        row.className = "facet-item" + (state.years.has(y) ? " selected" : "");
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.checked = state.years.has(y);
        cb.onchange = function() {{
          if (cb.checked) {{ state.years.clear(); state.years.add(y); }}
          else state.years.delete(y);
          buildYears(); renderActive(); render();
        }};
        const nm = document.createElement("span"); nm.className = "facet-name"; nm.textContent = y;
        const cnt = document.createElement("span"); cnt.className = "facet-count";
        let c = 0; for (const a of articles) {{ if (matchesOther(a, "year") && a.year === y) c++; }} cnt.textContent = c;
        row.appendChild(cb); row.appendChild(nm); row.appendChild(cnt);
        yearEl.appendChild(row);
      }});
    }}

    const authorEl = document.getElementById("authorList");
    const authorCount = new Map();
    articles.forEach(function(a) {{ if (a.author) authorCount.set(a.author, (authorCount.get(a.author) || 0) + 1); }});
    const topAuthors = [];
    authorCount.forEach(function(v, k) {{ topAuthors.push([k, v]); }});
    topAuthors.sort(function(a, b) {{ return b[1] - a[1]; }});
    function buildAuthors() {{
      authorEl.innerHTML = "";
      authorEl.className = "facet-list " + (showAllAuthors ? "expanded" : "collapsed");
      const list = showAllAuthors ? topAuthors : topAuthors.slice(0, 20);
      list.forEach(function(p) {{
        const name = p[0], total = p[1];
        const row = document.createElement("label");
        row.className = "facet-item" + (state.authors.has(name) ? " selected" : "");
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.checked = state.authors.has(name);
        cb.onchange = function() {{
          if (cb.checked) {{ state.authors.clear(); state.authors.add(name); }}
          else state.authors.delete(name);
          buildAuthors(); renderActive(); render();
        }};
        const nm = document.createElement("span"); nm.className = "facet-name"; nm.textContent = name;
        const cnt = document.createElement("span"); cnt.className = "facet-count";
        let c = 0; for (const a of articles) {{ if (matchesOther(a, "author") && a.author === name) c++; }} cnt.textContent = c;
        row.appendChild(cb); row.appendChild(nm); row.appendChild(cnt);
        authorEl.appendChild(row);
      }});
    }}

    const activeEl = document.getElementById("activeFilters");
    function renderActive() {{
      activeEl.innerHTML = "";
      const items = [];
      state.cats.forEach(function(c) {{ items.push({{ type: "cat", val: c }}); }});
      state.years.forEach(function(y) {{ items.push({{ type: "year", val: y }}); }});
      state.authors.forEach(function(a) {{ items.push({{ type: "author", val: a }}); }});
      if (!items.length) {{ activeEl.classList.remove("show"); return; }}
      activeEl.classList.add("show");
      const clear = document.createElement("span");
      clear.className = "chip clear"; clear.textContent = "清除全部";
      clear.onclick = function() {{
        state.cats.clear(); state.years.clear(); state.authors.clear();
        buildAll(); renderActive(); render();
      }};
      activeEl.appendChild(clear);
      items.forEach(function(it) {{
        const pill = document.createElement("span");
        pill.className = "chip";
        let label = it.type === "year" ? String(it.val) : it.val;
        if (it.type === "cat") label = "📁 " + label;
        if (it.type === "author") label = "@" + label;
        pill.textContent = label + " ×";
        pill.title = "点击移除";
        pill.onclick = function() {{
          if (it.type === "cat") state.cats.delete(it.val);
          else if (it.type === "year") state.years.delete(it.val);
          else state.authors.delete(it.val);
          buildAll(); renderActive(); render();
        }};
        activeEl.appendChild(pill);
      }});
    }}

    function buildAll() {{ buildTree(); buildYears(); buildAuthors(); }}

    const esc = s => (s == null ? "" : String(s));

    function renderTable(rows) {{
      const wrap = document.createElement("div");
      wrap.className = "table-wrap fade";
      const table = document.createElement("table");
      table.innerHTML =
        "<thead><tr><th>标题</th><th>作者</th><th>年份</th>" +
        "<th>分类 (Tag / 目录树)</th><th>链接</th></tr></thead>";
      const tb = document.createElement("tbody");
      rows.forEach(a => {{
        const tr = document.createElement("tr");
        const parts = (a.tags || []);
        const head = parts.length ? parts[parts.length - 1] : "";
        const trail = parts.slice(0, -1).join(" / ");
        tr.innerHTML =
          '<td><a class="title" href="' + esc(a.link) +
            '" target="_blank" rel="noopener noreferrer">' + esc(a.title) + "</a></td>" +
          '<td class="author">' + esc(a.author || "—") + "</td>" +
          '<td class="year">' + esc(a.year || "—") + "</td>" +
          '<td class="tagpath">' + (trail ? esc(trail) + " / " : "") +
            "<b>" + esc(head) + "</b></td>" +
          '<td><a href="' + esc(a.link) +
            '" target="_blank" rel="noopener noreferrer">打开 ↗</a></td>';
        tb.appendChild(tr);
      }});
      table.appendChild(tb);
      wrap.appendChild(table);
      return wrap;
    }}

    function renderCards(rows) {{
      const wrap = document.createElement("div");
      wrap.className = "cards fade";
      rows.forEach(a => {{
        const card = document.createElement("div");
        card.className = "card";
        const h3 = document.createElement("h3");
        const a1 = document.createElement("a");
        a1.href = a.link; a1.target = "_blank"; a1.rel = "noopener noreferrer";
        a1.textContent = a.title;
        h3.appendChild(a1);

        const meta = document.createElement("div");
        meta.className = "meta";
        const auth = document.createElement("span");
        auth.className = "author";
        auth.textContent = a.author || "—";
        meta.appendChild(auth);
        if (a.author_level) {{
          const b = document.createElement("span");
          b.className = "badge";
          b.textContent = a.author_level;
          meta.appendChild(b);
        }}
        if (a.year) {{
          const y = document.createElement("span");
          y.className = "year";
          y.textContent = a.year;
          meta.appendChild(y);
        }}

        const tags = document.createElement("div");
        tags.className = "tags";
        (a.tags || []).forEach(t => {{
          const s = document.createElement("span");
          s.textContent = t;
          tags.appendChild(s);
        }});

        const desc = document.createElement("div");
        desc.className = "desc";
        desc.textContent = a.description || "";

        card.appendChild(h3);
        card.appendChild(meta);
        card.appendChild(tags);
        if (a.description) card.appendChild(desc);
        wrap.appendChild(card);
      }});
      return wrap;
    }}

    const resultEl = document.getElementById("result");
    const countEl = document.getElementById("countPill");
    function render() {{
      const rows = articles.filter(matches);
      resultEl.innerHTML = "";
      countEl.textContent = rows.length + " 篇";
      if (!rows.length) {{
        const e = document.createElement("div");
        e.className = "empty";
        e.textContent = "没有匹配的文章，试试清除筛选或换个关键词。";
        resultEl.appendChild(e);
        return;
      }}
      resultEl.appendChild(state.view === "table"
        ? renderTable(rows) : renderCards(rows));
    }}

    document.getElementById("search").addEventListener("input", function(e) {{
      state.query = e.target.value.trim();
      render();
    }});
    document.getElementById("viewToggle").addEventListener("click", function(e) {{
      const btn = e.target.closest("button");
      if (!btn) return;
      state.view = btn.dataset.view;
      document.querySelectorAll("#viewToggle button")
        .forEach(function(b) {{ b.classList.toggle("active", b === btn); }});
      render();
    }});
    document.getElementById("authorToggle").onclick = function() {{
      showAllAuthors = !showAllAuthors;
      this.textContent = showAllAuthors ? "收起" : "展开全部";
      buildAuthors();
    }};
    document.getElementById("catClear").onclick = function() {{
      state.cats.clear(); expanded.clear();
      buildTree(); renderActive(); render();
    }};

    buildAll();
    renderActive();
    render();
  </script>
</body>
</html>
"""


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def main(argv=None):
    parser = argparse.ArgumentParser(
        description="生成 article/cf/cf-catalog.html（仅处理 cf 目录）")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("fetch", help="下载并缓存 Catalog 原始页面")
    sub.add_parser("parse", help="解析原始页面为 catalog.json")
    sub.add_parser("build", help="生成 cf-catalog.html")
    sub.add_parser("stats", help="打印统计信息")
    args = parser.parse_args(argv)

    cmd = args.cmd
    if cmd in (None, "all"):
        if cmd_fetch():
            return 1
        if cmd_parse():
            return 1
        return cmd_build()
    if cmd == "fetch":
        return cmd_fetch()
    if cmd == "parse":
        return cmd_parse()
    if cmd == "build":
        return cmd_build()
    if cmd == "stats":
        return cmd_stats()
    return 0


if __name__ == "__main__":
    sys.exit(main())
