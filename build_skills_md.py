#!/usr/bin/env python3
"""Bundle every Scheduled/<id>/SKILL.md into CommandCenter/data/skills_md.json {id: markdown}
so the Command Center Agents view can render full skill docs (server only serves CommandCenter/).
Run standalone or from the dispatcher tick. No network."""
import json, glob, os, sys
def root():
    for p in sorted(glob.glob("/sessions/*/mnt/Host Modern")):
        if os.path.isdir(p): return p
    for c in [os.path.expanduser("~/Library/CloudStorage/GoogleDrive-gabe@hostmodern.co/Shared drives/Host Modern/Claude/Host Modern"),
              os.path.expanduser("~/Library/CloudStorage/GoogleDrive-collin@hostmodern.co/Shared drives/Host Modern/Claude/Host Modern")]:
        if os.path.isdir(c): return c
    sys.exit("root not found")
R=root(); out={}
for p in glob.glob(os.path.join(R,"Scheduled","*","SKILL.md")):
    out[os.path.basename(os.path.dirname(p))]=open(p,encoding="utf-8",errors="ignore").read()
op=os.path.join(R,"CommandCenter","data","skills_md.json")
json.dump(out, open(op,"w",encoding="utf-8"), ensure_ascii=False)
print(f"wrote {op}: {len(out)} skills, {os.path.getsize(op)} bytes")
