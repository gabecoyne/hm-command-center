#!/usr/bin/env python3
"""Bundle the shared agent contracts (Scheduled/_shared/*.md) into
data/contracts_md.json {stem: markdown} so the Command Center Agents drawer can
render full contract docs (the server only serves the data/ pool). Sibling of
build_skills_md.py. Run standalone or from the dispatcher tick. No network.

The contracts are the agent estate's operating rules — the Operating Contract
(how every seat behaves), the Feedback/Attention Item Contract (how findings get
filed and answered), the Rollout Guide, and any domain contract (Paid Media
Allocation). The drawer shows the global ones on every agent, plus a domain
contract when it matches the agent's function.
"""
import json, glob, os, sys


def root():
    # Match the stable Scheduled/_shared landmark under ANY mount name — the shared
    # Drive folder mounts under a different name per machine (Gabe vs Collin), so
    # never hardcode "Host Modern" (see CLAUDE.md).
    for pat in ("/sessions/*/mnt/*/Scheduled/_shared",
                "/sessions/*/mnt/**/Scheduled/_shared"):
        for p in sorted(glob.glob(pat, recursive=True)):
            if os.path.isdir(p):
                return os.path.dirname(os.path.dirname(p))  # .../<Host Modern>
    for c in [os.path.expanduser("~/Library/CloudStorage/GoogleDrive-gabe@hostmodern.co/Shared drives/Host Modern/Claude/Host Modern"),
              os.path.expanduser("~/Library/CloudStorage/GoogleDrive-collin@hostmodern.co/Shared drives/Host Modern/Claude/Host Modern")]:
        if os.path.isdir(os.path.join(c, "Scheduled", "_shared")):
            return c
    sys.exit("root not found")


R = root()
out = {}
for p in sorted(glob.glob(os.path.join(R, "Scheduled", "_shared", "*.md"))):
    out[os.path.splitext(os.path.basename(p))[0]] = open(p, encoding="utf-8", errors="ignore").read()

# Canonical pool the server serves (data/); mirror to the deprecated CommandCenter/data
# backup if it still exists, matching skills_md.json's two-copy layout during cut-over.
targets = [os.path.join(R, "data", "contracts_md.json")]
cc = os.path.join(R, "CommandCenter", "data")
if os.path.isdir(cc):
    targets.append(os.path.join(cc, "contracts_md.json"))
for op in targets:
    os.makedirs(os.path.dirname(op), exist_ok=True)
    json.dump(out, open(op, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"wrote {op}: {len(out)} contracts, {os.path.getsize(op)} bytes")
