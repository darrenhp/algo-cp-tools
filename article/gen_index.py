#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen_index.py — 生成 article/index.html 的工具。

本工具只处理 article 目录（即本脚本所在目录），维护一个 pages.txt 清单，
清单中的每一行是一个相对地址（相对于 article 目录）。运行 build 即可根据
清单生成 index.html。

设计要点：
  * 只处理 article 目录，不扫描/生成上级工程（algo-cp-tools）的其它模块。
  * 清单以「相对地址」维护，生成的 index.html 中链接同样使用相对地址，
    因此整目录可直接用浏览器打开，也可整体部署。
  * 页面标题自动从目标 HTML 的 <title>（其次 <h1>，再回退文件名）提取，
    无需在清单里重复维护标题。

用法：
  python gen_index.py                # 等价于 build
  python gen_index.py build          # 根据清单生成 index.html
  python gen_index.py list           # 列出已登记页面
  python gen_index.py add <相对路径>  # 添加一页
  python gen_index.py remove <相对路径>
  python gen_index.py scan [--dry-run]   # 自动发现并登记 *_讲解_中文.html
"""

import argparse
import datetime
import html
import os
import re
import sys
import urllib.parse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(BASE_DIR, "pages.txt")
OUTPUT = os.path.join(BASE_DIR, "index.html")

# scan 时跳过的目录名
SCAN_SKIP_DIRS = {"blogs_raw", "blogs_text", "images", "zh", "_files",
                  "形式的べき級数解説 _ maspyのHP_files"}
# scan 时匹配的文件名模式
SCAN_GLOB = "*讲解_中文.html"


def read_manifest():
    """读取清单，返回 (meta_dict, pages_list)。

    meta_dict 可能包含 title / description。pages_list 为去重后的相对路径列表，
    保持出现顺序。
    """
    meta = {}
    pages = []
    seen = set()
    if not os.path.isfile(MANIFEST):
        return meta, pages
    with open(MANIFEST, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                # 解析特殊指令 # @key value
                m = re.match(r"^#\s*@(\w+)\s+(.*)$", line)
                if m:
                    meta[m.group(1)] = m.group(2).strip()
                continue
            if line not in seen:
                seen.add(line)
                pages.append(line)
    return meta, pages


def write_manifest(meta, pages):
    """把 meta / pages 写回清单文件。"""
    lines = []
    if meta.get("title"):
        lines.append("# @title " + meta["title"])
    if meta.get("description"):
        lines.append("# @description " + meta["description"])
    if lines:
        lines.append("")
    # 保留其余注释头（简单起见，这里只重写指令 + 页面列表）
    for p in pages:
        lines.append(p)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def extract_title(rel_path):
    """从目标 HTML 提取标题，失败回退到文件名。"""
    full = os.path.join(BASE_DIR, rel_path)
    if not os.path.isfile(full):
        return os.path.basename(rel_path)
    try:
        with open(full, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
    except OSError:
        return os.path.basename(rel_path)
    m = re.search(r"<title[^>]*>(.*?)</title>", text, re.IGNORECASE | re.DOTALL)
    if m:
        t = re.sub(r"\s+", " ", m.group(1)).strip()
        if t:
            return t
    m = re.search(r"<h1[^>]*>(.*?)</h1>", text, re.IGNORECASE | re.DOTALL)
    if m:
        t = re.sub(r"<[^>]+>", "", m.group(1))
        t = re.sub(r"\s+", " ", t).strip()
        if t:
            return t
    return os.path.basename(rel_path)


def category_of(rel_path):
    """用直接父目录名作为分组类别。"""
    parent = os.path.dirname(rel_path)
    if not parent:
        return "文章"
    return os.path.basename(parent)


def build():
    meta, pages = read_manifest()
    title = meta.get("title") or "Algo CP Tools · 文章索引"
    description = meta.get("description") or ""

    # 分组：保持清单顺序，组内同样保持清单顺序
    groups = {}          # category -> list of (rel_path, title, href)
    order = []
    for rel in pages:
        full = os.path.join(BASE_DIR, rel)
        if not os.path.isfile(full):
            print(f"[warn] 清单中的页面不存在，已跳过：{rel}", file=sys.stderr)
            continue
        cat = category_of(rel)
        href = urllib.parse.quote(rel, safe="/")
        if cat not in groups:
            groups[cat] = []
            order.append(cat)
        groups[cat].append((rel, extract_title(rel), href))

    groups_html = []
    for cat in order:
        items = []
        for rel, t, href in groups[cat]:
            items.append(
                f'        <li><a href="{href}" target="_blank" '
                f'rel="noopener noreferrer">{html.escape(t)}</a>'
                f'<span class="path">{html.escape(rel)}</span></li>'
            )
        items_html = "\n".join(items)
        groups_html.append(
            f'    <section class="group">\n'
            f'      <h2>{html.escape(cat)}</h2>\n'
            f'      <ul class="page-list">\n{items_html}\n      </ul>\n'
            f'    </section>'
        )
    groups_html = "\n".join(groups_html) if groups_html else \
        '    <p class="empty">清单为空，使用 <code>python gen_index.py add &lt;相对路径&gt;</code> 添加页面。</p>'

    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    doc = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <title>{html.escape(title)}</title>
  <style>
    :root {{
      --bg: #0f1115;
      --panel: #171a21;
      --border: #2a2f3a;
      --text: #e6e8ec;
      --muted: #9aa3b2;
      --accent: #4f8cff;
      --accent-2: #6ee7b7;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
        "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }}
    .app-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 28px;
      background: var(--panel);
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }}
    .app-header h1 {{ font-size: 20px; margin: 0; }}
    .header-right {{ display: flex; align-items: center; gap: 16px; }}
    .header-right a {{
      color: var(--muted);
      text-decoration: none;
      font-size: 14px;
    }}
    .header-right a:hover {{ color: var(--accent); }}
    main {{ max-width: 920px; margin: 0 auto; padding: 28px; }}
    .desc {{ color: var(--muted); margin: 0 0 24px; }}
    .group {{ margin-bottom: 32px; }}
    .group h2 {{
      font-size: 16px;
      color: var(--accent-2);
      border-left: 3px solid var(--accent-2);
      padding-left: 10px;
      margin-bottom: 12px;
    }}
    .page-list {{ list-style: none; margin: 0; padding: 0; }}
    .page-list li {{
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 10px;
      transition: border-color .15s, transform .15s;
    }}
    .page-list li:hover {{
      border-color: var(--accent);
      transform: translateX(2px);
    }}
    .page-list a {{
      color: var(--text);
      text-decoration: none;
      font-size: 15px;
      font-weight: 600;
    }}
    .page-list a:hover {{ color: var(--accent); }}
    .path {{
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      margin-top: 4px;
    }}
    .empty {{ color: var(--muted); }}
    code {{
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
    }}
    footer {{
      max-width: 920px;
      margin: 0 auto;
      padding: 0 28px 40px;
      color: var(--muted);
      font-size: 12px;
    }}
  </style>
</head>
<body>
  <header class="app-header">
    <h1>{html.escape(title)}</h1>
    <div class="header-right">
      <a href="../index.html" rel="noopener noreferrer">← 返回主站</a>
      <a href="https://github.com/darrenhp/algo-cp-tools" target="_blank" rel="noopener noreferrer">GitHub</a>
    </div>
  </header>

  <main>
    {f'<p class="desc">{html.escape(description)}</p>' if description else ''}
{groups_html}
  </main>

  <footer>
    由 gen_index.py 自动生成 · 最后更新 {now} · 仅处理 article 目录
  </footer>
</body>
</html>
"""
    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(doc)
    total = sum(len(v) for v in groups.values())
    print(f"[ok] 已生成 {os.path.relpath(OUTPUT, BASE_DIR)}（{total} 个页面，{len(order)} 个分组）")


def cmd_list():
    meta, pages = read_manifest()
    if meta.get("title"):
        print(f"标题：{meta['title']}")
    if not pages:
        print("（清单为空）")
        return
    print(f"已登记 {len(pages)} 个页面：")
    for rel in pages:
        full = os.path.join(BASE_DIR, rel)
        mark = "OK " if os.path.isfile(full) else "MISS"
        print(f"  [{mark}] {rel}")


def cmd_add(rel):
    rel = rel.strip().lstrip("/")
    if not rel:
        print("[error] 请提供相对路径", file=sys.stderr)
        return 1
    meta, pages = read_manifest()
    if rel in pages:
        print(f"[info] 已在清单中：{rel}")
        return 0
    pages.append(rel)
    write_manifest(meta, pages)
    print(f"[ok] 已添加：{rel}")
    return 0


def cmd_remove(rel):
    rel = rel.strip().lstrip("/")
    meta, pages = read_manifest()
    if rel not in pages:
        print(f"[info] 清单中不存在：{rel}")
        return 0
    pages.remove(rel)
    write_manifest(meta, pages)
    print(f"[ok] 已移除：{rel}")
    return 0


def cmd_scan(dry_run):
    import fnmatch
    meta, pages = read_manifest()
    seen = set(pages)
    found = []
    for root, dirs, files in os.walk(BASE_DIR):
        # 跳过隐藏目录与指定目录
        dirs[:] = [d for d in dirs
                   if not d.startswith(".")
                   and d not in SCAN_SKIP_DIRS]
        for name in files:
            if fnmatch.fnmatch(name, SCAN_GLOB):
                full = os.path.join(root, name)
                rel = os.path.relpath(full, BASE_DIR)
                rel = rel.replace(os.sep, "/")
                if rel not in seen:
                    found.append(rel)
                    seen.add(rel)
    if not found:
        print("[info] 未发现新的候选页面")
        return 0
    for rel in found:
        print(f"  发现：{rel}")
    if dry_run:
        print(f"[info] 共 {len(found)} 个候选（dry-run，未写入）")
        return 0
    pages.extend(found)
    write_manifest(meta, pages)
    print(f"[ok] 已加入 {len(found)} 个页面")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="生成 article/index.html（仅处理 article 目录）")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("build", help="根据清单生成 index.html（默认）")
    sub.add_parser("list", help="列出已登记页面")
    p_add = sub.add_parser("add", help="添加一页")
    p_add.add_argument("path", help="相对地址（相对 article 目录）")
    p_rm = sub.add_parser("remove", help="移除一页")
    p_rm.add_argument("path", help="相对地址（相对 article 目录）")
    p_scan = sub.add_parser("scan", help="自动发现 *_讲解_中文.html 并登记")
    p_scan.add_argument("--dry-run", action="store_true", help="只显示不写入")
    args = parser.parse_args(argv)

    cmd = args.cmd or "build"
    if cmd == "build":
        build()
    elif cmd == "list":
        cmd_list()
    elif cmd == "add":
        return cmd_add(args.path)
    elif cmd == "remove":
        return cmd_remove(args.path)
    elif cmd == "scan":
        return cmd_scan(args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
