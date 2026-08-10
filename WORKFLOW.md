# Command Center — Git Workflow

**Repo:** `github.com/gabecoyne/hm-command-center` · branch `main` is the source of truth for **code**.
**This repo tracks code only.** All runtime state (`data/*.json`, the attention queue, `ecomm_state.json`, etc.) lives on the shared Google Drive and is written by collectors and agents. Git never carries it; see `.gitignore`.

## Why this exists

Multiple Claude conversations edit the Command Center at once. Before git, they wrote directly to the Drive copy and silently clobbered each other — that's what the pile of `index.pre-*.bak` files was. Git replaces that: each conversation works on its own branch, merges to `main`, and collisions surface as merge conflicts instead of vanishing.

## Environment facts (read these — they're not obvious)

- **Cloud sessions reach GitHub through a managed git proxy.** Stored PATs (e.g. `github_collin_config.env`) are ignored — the proxy injects credentials itself. A push only works if **this repo is in the session's authorized repository set**. If it isn't, `push` returns 403 ("not in this session's authorized repository set"). Attach the repo to the session (desktop app → connect source), or start the task with the repo connected.
- **`device_bash` on the Mac has no network** — it cannot push or pull. All git traffic happens from the cloud container.
- **Never put `.git` inside the Google Drive folder.** Drive File Stream corrupts git locks. Always clone into a throwaway dir (`/tmp/...`), never into `Dev/` or the Drive `CommandCenter/` folder.

## Per-conversation loop

Each conversation that touches the Command Center:

```bash
# 1. Fresh isolated clone (own working tree = no toe-stepping)
cd /tmp && rm -rf cc && git clone https://github.com/gabecoyne/hm-command-center.git cc && cd cc

# 2. Branch named for the AREA you're working on
git checkout -b cc/<area>          # e.g. cc/approvals-card, cc/schedule-view

# 3. Edit code. Commit as you go.
git add -A && git commit -m "…"

# 4. Merge to main (pull first so you land on top of others' work)
git checkout main && git pull --ff-only
git merge cc/<area>                # resolve conflicts here if two conversations hit the same lines
git push origin main
git branch -d cc/<area>

# 5. Deploy the merged code to Drive so server.py + Collin see it (see below)
```

**Coordination rule:** one conversation, one *area* → one branch. Because they touch different parts, merges auto-resolve; git only stops you when two conversations edit the *same lines* — which is exactly the collision you want made loud.

> NOTE: the current code is one large `index.html`. Until it's split into per-view files, "different areas" still means "different regions of the same file," so expect occasional real conflicts. Splitting the monolith into modules is the fast-follow that makes parallel work truly clean.

## Deploy: main → Drive (code only)

The Drive `CommandCenter/` folder is the **deployed copy** that `server.py` serves and Collin sees. After merging to `main`, copy the **code files only** from a clean checkout into Drive — never touch `data/`:

Files to deploy: `index.html`, `server.py`, `launch.command`, `build_schedule_snapshot.py`, `build_skills_md.py`, `assets/*`.
Never deploy or overwrite: `data/` (runtime state).

From a cloud session, deploy = `device_commit_files` each code file from the checkout to its path under the Drive `CommandCenter/` folder. Because `data/` is gitignored, a clean checkout has no `data/`, so a deploy physically cannot clobber state.

## What NOT to do

- Don't edit the Drive `CommandCenter/index.html` directly — it's deploy output, not source. Edit via the repo.
- Don't commit anything under `data/`.
- Don't create new `.bak` files — that's what git history is for.
