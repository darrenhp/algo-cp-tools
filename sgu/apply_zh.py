#!/usr/bin/env python3
"""将 zh.py 中的中文名映射回填 problems.json。"""
import json
import sys

sys.path.insert(0, ".")
from zh import ZH  # noqa: E402

with open("problems.json", encoding="utf-8") as f:
    problems = json.load(f)

missing = []
for p in problems:
    zh = ZH.get(p["id"])
    if zh:
        p["zhName"] = zh
    else:
        missing.append(p["id"])

with open("problems.json", "w", encoding="utf-8") as f:
    json.dump(problems, f, ensure_ascii=False, indent=2)

filled = sum(1 for p in problems if p["zhName"])
print(f"总题数 {len(problems)}，已填中文名 {filled}")
if missing:
    print("缺少中文名的题号：", missing)
