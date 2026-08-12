# Command Center — Git & Update Workflow (STANDARD)

## Run on your computer, not the cloud

**Standard:** every Command Center update runs as an **on-computer** Cowork session, working directly in `~/dev/hm-command-center`.

- Set it in the desktop app: **Settings → Cowork → turn OFF "Run new tasks in the cloud"** (makes on-computer the default), or per task via the **"Run this task"** picker (top-right when starting a task) → **On your computer**.
- **Why:** on-computer sessions run on your Mac with native git + network. They `pull`, `commit`, and `push` to `main` themselves, so **the local repo AND GitHub stay in sync automatically**. Cloud sessions cannot — their bridge has no network and they can't push to un-preauthorized repos — so they leave `~/dev` stale. That staleness is the whole problem this standard removes.

## The repo

- **Local clone:** `~/dev/hm-command-center` on each machine (Gabe + Collin).
- **Remote:** `github.com/gabecoyne/hm-command-center`, branch **`main` = source of truth for CODE**.
- **Data is NOT in git** — it lives in the shared root `data/` pool (see `.gitignore`). Never commit data.

## Standard procedure for EVERY Command Center update (on-computer)

Claude performs all four steps itself in an on-computer session:

```
git -C ~/dev/hm-command-center pull --ff-only     # 1. pull first — never clobber concurrent work
# 2. make changes in ~/dev
git add -A && git commit -m "…clear message…"     # 3. commit
git push origin main                              # 4. push when done
```

Never leave `~/dev` with uncommitted Command Center changes at the end of a session.

## Keeping every local repo current

- The machine you work on is current by construction (work happens in its `~/dev`).
- For changes made **elsewhere** (the other person's machine, or a forced cloud session), a scheduled local `git -C ~/dev/hm-command-center pull --ff-only` on each Mac keeps `~/dev` synced with `main`. Set this up once per machine (launchd job or a lightweight scheduled task).

## Deploy to the live dashboard

The Drive `CommandCenter/` folder is the **served** copy. "Go live" = copy the code files from `~/dev` into Drive `CommandCenter/` (leave `data/` alone — it's the shared pool). The live dashboard stays on the old version until you deploy.

## Cloud-session fallback (NOT preferred)

If a task is forced to run in the cloud: work in a `/tmp` clone. It **cannot** push (sandbox git proxy) or update `~/dev` (bridge has no network). Hand the change to an on-computer session to commit + push, or authorize the repo as a session source. Prefer just running on-computer.
