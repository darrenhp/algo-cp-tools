import sys
path = sys.argv[1]
text = sys.stdin.read()
with open(path, 'a', encoding='utf-8') as f:
    f.write(text)
print("appended", len(text), "chars to", path)
