#!/usr/bin/env python3
"""
build_schedule_snapshot.py — Feed the Command Center "Schedule" tab.

Reads the schedule table + live run state and writes CommandCenter/data/schedule.json:
  - Scheduled/_inventory.json            (config: cron, machine, run_via, browser, enabled)
  - Scheduled/_state/{machine}.json      (last_run / last_status per task — written by the dispatcher)
  - Logs/HM_Dispatcher_Log.md            (per-run history rows, if present)
  - CommandCenter/data/reports.json      (to link a task to its recent reports)

Run standalone, or let the dispatcher call it at the end of each tick so the tab
reflects the latest runs. No network, no LLM — pure assembly.

    python3 CommandCenter/build_schedule_snapshot.py [--days 7]
"""
from __future__ import annotations
import os, sys, json, glob, argparse, datetime, re
try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("America/Chicago")
except Exception:
    TZ = None

def drive_root():
    for p in sorted(glob.glob("/sessions/*/mnt/Host Modern")) + sorted(glob.glob("/sessions/*/mnt/Claude--Host Modern")):
        if os.path.isdir(p): return p
    for c in [os.path.expanduser("~/Library/CloudStorage/GoogleDrive-gabe@hostmodern.co/Shared drives/Host Modern/Claude/Host Modern"),
              os.path.expanduser("~/Library/CloudStorage/GoogleDrive-collin@hostmodern.co/Shared drives/Host Modern/Claude/Host Modern")]:
        if os.path.isdir(c): return c
    sys.exit("Host Modern Drive root not found.")

def _field(f, v, lo, hi):
    if f == "*": return True
    for part in f.split(","):
        step = 1; rng = part
        if "/" in part: rng, s = part.split("/"); step = int(s)
        if rng == "*": a, b = lo, hi
        elif "-" in rng: a, b = map(int, rng.split("-"))
        else: a = b = int(rng)
        if a <= v <= b and (v - a) % step == 0: return True
    return False

def cron_matches(cron, dt):
    mn, hr, dom, mon, dow = cron.split()
    cdow = (dt.weekday() + 1) % 7
    if not _field(mn, dt.minute, 0, 59): return False
    if not _field(hr, dt.hour, 0, 23): return False
    if not _field(mon, dt.month, 1, 12): return False
    dok = _field(dom, dt.day, 1, 31); wok = _field(dow, cdow, 0, 6) or (cdow == 0 and _field(dow, 7, 0, 7))
    if dom != "*" and dow != "*": return dok or wok
    return dok and wok

def occurrences(cron, start, days):
    """All matching minutes in [start, start+days), collapsed so dispatcher-minute offsets read at their hour."""
    out = []
    dt = start.replace(minute=0, second=0, microsecond=0)
    end = start + datetime.timedelta(days=days)
    step = datetime.timedelta(minutes=1)
    # scan minute-by-minute but only keep matches; bounded to days*1440
    cur = start.replace(second=0, microsecond=0)
    while cur < end:
        if cron_matches(cron, cur):
            out.append(cur)
        cur += step
    return out

def parse_log(path):
    """Parse Logs/HM_Dispatcher_Log.md table rows -> {task_id: [ {ts,machine,status,note} ]}."""
    hist = {}
    if not os.path.isfile(path): return hist
    for line in open(path, encoding="utf-8", errors="ignore"):
        if not line.strip().startswith("|"): continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4: continue
        ts, machine, task_id, status = cells[0], cells[1], cells[2], cells[3]
        note = cells[4] if len(cells) > 4 else ""
        if task_id.lower() in ("task_id", "task", "") or set(ts) <= set("-: "): continue
        hist.setdefault(task_id, []).append({"ts": ts, "machine": machine, "status": status, "note": note})
    for k in hist: hist[k] = sorted(hist[k], key=lambda r: r["ts"], reverse=True)[:15]
    return hist

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--days", type=int, default=7); ap.add_argument("--now"); args = ap.parse_args()
    root = drive_root()
    now = (datetime.datetime.fromisoformat(args.now).replace(tzinfo=TZ) if args.now and TZ else
           (datetime.datetime.fromisoformat(args.now) if args.now else (datetime.datetime.now(TZ) if TZ else datetime.datetime.now())))
    inv = json.load(open(os.path.join(root, "Scheduled", "_inventory.json")))
    disp = inv.get("dispatcher", {})
    # per-machine state
    state = {}
    sdir = os.path.join(root, "Scheduled", "_state")
    for m in {t.get("machine") for t in inv["tasks"]}:
        sp = os.path.join(sdir, f"{m}.json")
        state[m] = json.load(open(sp)) if os.path.isfile(sp) else {"last_run": {}, "last_status": {}}
    hist = parse_log(os.path.join(root, "Logs", "HM_Dispatcher_Log.md"))
    # task_id -> owning agent, from the agent roster (skills lists in ecomm_state.json)
    task_agent = {}
    esp = os.path.join(root, "Wiki", "data", "ecomm_state.json")
    if os.path.isfile(esp):
        try:
            for a in json.load(open(esp)).get("agents", []):
                sk = a.get("skills") or ([a["skill"]] if a.get("skill") else [])
                for s in sk:
                    base = str(s).split("/")[-2] if "/SKILL" in str(s) else str(s)
                    task_agent[base] = a.get("id")
        except Exception:
            pass
    # reports linkage (best-effort: report.source or path mentions task_id)
    reports = {"items": []}
    rp = os.path.join(root, "CommandCenter", "data", "reports.json")
    if os.path.isfile(rp):
        try: reports = json.load(open(rp))
        except Exception: pass
    def report_ids_for(tid):
        out = []
        for r in reports.get("items", []):
            hay = f"{r.get('source','')} {r.get('path','')} {r.get('title','')}".lower()
            if tid.lower() in hay: out.append(r.get("id"))
        return out[:8]

    tasks_out = []
    week = {}  # date -> list of runs
    horizon_days = args.days
    for t in inv["tasks"]:
        m = t.get("machine"); st = state.get(m, {})
        occ = occurrences(t["cron"], now, horizon_days)
        # collapse dispatcher minute-offsets to top-of-next-hour for display honesty
        disp_task = t.get("run_via") == "dispatcher"
        shown = []
        for o in occ:
            eff = o
            if disp_task and o.minute != 0:
                eff = (o.replace(minute=0) + datetime.timedelta(hours=1))
            shown.append(eff)
        shown = sorted(set(shown))
        next_run = shown[0].isoformat() if shown else None
        rec = {
            "task_id": t["task_id"], "description": t.get("description", ""),
            "machine": m, "cron": t["cron"], "schedule_human": t.get("schedule_human", ""),
            "run_via": t.get("run_via", "dispatcher"), "browser": bool(t.get("browser")),
            "enabled": t.get("enabled", True), "owner": t.get("owner", ""),
            "canonical_drive_path": t.get("canonical_drive_path", ""),
            "last_run": st.get("last_run", {}).get(t["task_id"]),
            "last_status": st.get("last_status", {}).get(t["task_id"]),
            "next_run": next_run,
            "runs_next_7d": len(shown),
            "agent": task_agent.get(t["task_id"]),
            "history": hist.get(t["task_id"], []),
            "report_ids": report_ids_for(t["task_id"]),
        }
        tasks_out.append(rec)
        for o in shown:
            d = o.date().isoformat()
            week.setdefault(d, []).append({"time": o.strftime("%H:%M"), "task_id": t["task_id"],
                                           "machine": m, "run_via": rec["run_via"], "browser": rec["browser"],
                                           "agent": rec["agent"], "last_status": rec["last_status"]})
    for d in week: week[d] = sorted(week[d], key=lambda r: (r["time"], r["task_id"]))

    # dispatcher status per machine
    mach_status = {}
    for m, s in state.items():
        lrs = [v for v in (s.get("last_run") or {}).values() if v]
        mach_status[m] = {"last_dispatch": max(lrs) if lrs else None,
                          "tasks": sum(1 for t in inv["tasks"] if t.get("machine") == m and t.get("run_via") == "dispatcher")}

    out = {
        "updated": now.isoformat(),
        "generated_by": "build_schedule_snapshot.py",
        "dispatcher": {"cron": disp.get("cron", "0 * * * *"), "max_concurrency": disp.get("max_concurrency", 3),
                       "register_as": disp.get("register_as", [])},
        "machine_status": mach_status,
        "tasks": sorted(tasks_out, key=lambda r: (r["machine"], r["run_via"] != "dispatcher", r["task_id"])),
        "week": week,
        "days": horizon_days,
    }
    outp = os.path.join(root, "CommandCenter", "data", "schedule.json")
    os.makedirs(os.path.dirname(outp), exist_ok=True)
    tmp = outp + ".tmp"
    json.dump(out, open(tmp, "w"), indent=2); os.replace(tmp, outp)
    print(f"wrote {outp}: {len(tasks_out)} tasks, {len(week)} days, machines={list(mach_status)}")

if __name__ == "__main__":
    raise SystemExit(main())
