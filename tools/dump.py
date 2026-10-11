"""Print a save's summary and Markdown as JSON for the parity harness (stdout: one JSON object)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from witcher_to_md import load_db, summarize_file
from witcher.render import md

p = Path(sys.argv[1])
s = summarize_file(p, load_db())
print(json.dumps({"summary": s, "md": md(s, p.name)}, default=list, ensure_ascii=False))
