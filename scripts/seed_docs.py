#!/usr/bin/env python3
"""Load the blob feeds (data/*.json) into D1 via the Command Center API.
Uses PUT /api/data/<key>, so values are bound parameters and dodge D1's SQL statement-size cap.

    # local dev server:
    python3 scripts/seed_docs.py http://127.0.0.1:8788 [/path/to/data]
    # live, behind Access (service token):
    CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... python3 scripts/seed_docs.py https://cc.example.com
"""
import glob, json, os, sys, urllib.request

def find_pool(argv):
    if len(argv) > 2 and os.path.isdir(argv[2]): return argv[2]
    for pat in ("/sessions/*/mnt/*/data", "/sessions/*/mnt/Host Modern/data",
                os.path.expanduser("~/Library/CloudStorage/*/Shared drives/Host Modern/Claude/Host Modern/data")):
        for p in sorted(glob.glob(pat)):
            if os.path.isfile(os.path.join(p, "ecomm_state.json")): return p
    sys.exit("could not locate the data pool; pass it as the 2nd arg")

def main():
    if len(sys.argv) < 2: sys.exit("usage: seed_docs.py <base_url> [pool]")
    base = sys.argv[1].rstrip("/"); pool = find_pool(sys.argv)
    hdr = {"Content-Type": "application/json", "User-Agent": "hm-cc-seed/1.0 (+https://hostmodern.co)", "Accept": "application/json"}
    if os.environ.get("CF_ACCESS_CLIENT_ID"):
        hdr["CF-Access-Client-Id"] = os.environ["CF_ACCESS_CLIENT_ID"]
        hdr["CF-Access-Client-Secret"] = os.environ.get("CF_ACCESS_CLIENT_SECRET", "")
    ok = fail = 0
    for fp in sorted(glob.glob(os.path.join(pool, "*.json"))):
        name = os.path.basename(fp)
        try:
            raw = open(fp, "rb").read(); json.loads(raw)
            req = urllib.request.Request(f"{base}/api/data/{name}", data=raw, headers=hdr, method="PUT")
            with urllib.request.urlopen(req, timeout=30) as r:
                if r.status == 200: ok += 1
                else: fail += 1; print("  !", name, r.status)
        except Exception as e:
            fail += 1; print("  !", name, type(e).__name__, str(e)[:80])
    print(f"uploaded {ok} docs, {fail} failed  ->  {base}")

if __name__ == "__main__": main()
