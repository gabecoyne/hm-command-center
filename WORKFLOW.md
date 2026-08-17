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

**The live dashboard is Cloudflare Pages, project `hm-command-center`.**
`https://command.hostmodern.co` (and `https://hm-command-center.pages.dev`), behind Cloudflare Access.

Two things that are NOT the deploy, despite what this file used to say:

- **The Drive `CommandCenter/` folder does not serve anything.** Its code half is dead — frozen at 2026-08-10, missing `Cro.js` and `Feedback.js`, still carrying the renamed `Attention.js`. Do not copy code into it and do not treat it as live. (Its `data/` subfolder is still the live Drive pool during the D1 migration — leave that alone.)
- **`git push` does not deploy.** The Pages project was created as a **direct-upload** project (`source: null`); it has no Git connection, so nothing auto-builds. Every production deployment to date has trigger `ad_hoc`.

### Going live = one command

From a clean checkout of `main` (not the Drive copy):

```
git -C ~/dev/hm-command-center pull --ff-only
set -a; source "<Drive>/Host Modern/Config/cloudflare_config.env"; set +a
npx wrangler pages deploy . \
  --project-name hm-command-center \
  --branch main \
  --commit-hash "$(git rev-parse HEAD)"
```

`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` come from `Config/cloudflare_config.env`.
`--branch main` is what makes it a **production** deploy — the project's production branch is `main`. Omit it and you get a preview URL only.

Push to `main` first anyway: the deploy is an upload of your working tree, so an un-pushed commit means the live site and GitHub disagree with no record of what shipped. Passing `--commit-hash` is what ties a deployment back to a commit in the Cloudflare deployment list.

**Verify after deploying** — the browser caches the ES modules, so a normal reload can keep showing the old UI even when the deploy succeeded. Fetch the asset itself rather than trusting the page:

```js
await (await fetch('/src/views/Cro.js?cb=' + Date.now(), {cache:'no-store'})).text()
```

### Known gap: Pages is not Git-connected

Cloudflare cannot convert a direct-upload Pages project to a Git-connected one. Getting `git push` → auto-deploy means creating a **new** Pages project connected to `gabecoyne/hm-command-center` (production branch `main`, no build command, output dir `/`) and then re-attaching everything the current project owns: the `DB` D1 binding (`5355e921-e3fc-4bd9-acea-3a5b343ca2c2`), the `command.hostmodern.co` custom domain, and the Access application + policies + `hm-machine-runner` service token. Until someone does that migration, deploys are the manual command above.

## Cloud-session fallback (NOT preferred)

If a task is forced to run in the cloud: work in a `/tmp` clone. It **cannot** push (sandbox git proxy) or update `~/dev` (bridge has no network). Hand the change to an on-computer session to commit + push, or authorize the repo as a session source. Prefer just running on-computer.
