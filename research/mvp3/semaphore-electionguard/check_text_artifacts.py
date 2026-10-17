"""Check new documentation links, trailing whitespace and final newlines."""

import re
from pathlib import Path

base = Path(__file__).resolve().parent
root = base.parents[2]
docs = root / "docs" / "mvp3" / "semaphore-electionguard"
files = list(docs.glob("*.md")) + list(base.glob("*.py")) + list(base.glob("*.mjs")) + list(base.glob("*.sol"))
problems = []
for path in files:
    content = path.read_text(encoding="utf-8")
    if not content.endswith("\n"):
        problems.append(f"{path}: missing final newline")
    for number, line in enumerate(content.splitlines(), 1):
        if line.rstrip(" \t") != line:
            problems.append(f"{path}:{number}: trailing whitespace")
    if path.suffix == ".md":
        for target in re.findall(r"\]\(([^)]+)\)", content):
            if "://" in target or target.startswith("#"):
                continue
            relative = target.split("#", 1)[0]
            if relative and not (path.parent / relative).exists():
                problems.append(f"{path}: missing link {target}")
if problems:
    raise SystemExit("\n".join(problems))
print(f"checked {len(files)} text files: whitespace, newline and local links OK")
