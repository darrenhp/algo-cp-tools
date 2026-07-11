#!/usr/bin/env python3
"""从 p.txt 提取 SGU(acmsguru) 题目数据，生成 problems.json。

p.txt 格式（由网页复制得到）：
    152
    未找到	Making round	 		x122
即：题号独占一行；下一行用制表符分隔，形如
    <状态> \t <英文标题> \t <空白> \t x<通过人数>
其中 <状态> 为中文（未找到/加载中…/等待中…），英文标题为含 ASCII 字母的字段。
"""
import json
import re
import sys

SRC = "p.txt"
OUT = "problems.json"

# 状态字段中的中文噪声，提取标题时应跳过
STATUS_HINTS = ("未找到", "加载", "等待", "…")


def is_id_line(line: str) -> bool:
    return bool(re.fullmatch(r"\d+", line.strip()))


def extract_title(detail: str) -> str:
    """从详情行中挑出英文标题字段。"""
    fields = [f.strip() for f in detail.split("\t")]
    best = None
    best_score = -1
    for f in fields:
        if not f:
            continue
        if any(h in f for h in STATUS_HINTS):   # 跳过中文状态
            continue
        if re.fullmatch(r"x\d+", f):            # 跳过 x<通过人数>
            continue
        if re.fullmatch(r"\d+", f):             # 跳纯数字
            continue
        score = sum(1 for c in f if c.isascii() and c.isalpha())
        if score > best_score:
            best_score = score
            best = f
    if best is None:                            # 兜底：整行去噪声
        best = re.sub(r"[未找到加载中等待…\tx\d+]+", "", detail).strip()
    return re.sub(r"\s+", " ", best).strip()


def parse(path: str):
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()
    problems = []
    seen = set()
    n = len(lines)
    i = 0
    while i < n:
        line = lines[i].strip()
        if is_id_line(line):
            pid = line
            j = i + 1
            while j < n and not lines[j].strip():
                j += 1
            en_name = ""
            if j < n:
                en_name = extract_title(lines[j].strip())
            if pid not in seen and en_name:
                seen.add(pid)
                problems.append({
                    "id": pid,
                    "enName": en_name,
                    "zhName": "",
                    "cfUrl": f"https://codeforces.com/problemsets/acmsguru/problem/99999/{pid}",
                    "vjudgeUrl": f"https://vjudge.net/problem/SGU-{pid}#author=translator:1281309:zh",
                })
            i = j + 1
        else:
            i += 1
    return problems


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else SRC
    problems = parse(path)
    problems.sort(key=lambda p: int(p["id"]), reverse=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(problems, f, ensure_ascii=False, indent=2)
    print(f"已提取 {len(problems)} 道题，写入 {OUT}")
    for p in problems[:3]:
        print(f"  #{p['id']}  {p['enName']}")


if __name__ == "__main__":
    main()
