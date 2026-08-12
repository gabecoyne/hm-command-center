# Command Center on Cloudflare — deploy runbook

This branch (`cc/cloudflare-ready`) makes the Command Center deployable to Cloudflare **without
changing the app**. The API server.py exposes is re-implemented as **Pages Functions** backed by
**D1** (one database in the cloud), so both dashboards read the same data and the collectors can
run on Cloudflare's timer. `server.py` still works for local dev — nothing existing was removed.

```
Browser (Gabe/Collin) ─► Cloudflare Access (Google login) ─► Pages (this app)
                                                               └─► /functions/api/*  ─► D1
Cloud Cron Workers (collectors) ───────────────────────────────────────────────────►  D1
MacBook Pro runner (browser + agent tasks) ─► POST /api/* (service token) ──────────►  D1
```

## What's in the branch
- `functions/` — the whole API, same paths as `server.py`:
  `GET /api/health`, `GET|PUT /api/data/<key>`, `GET /api/attention/state`,
  `POST /api/attention/item|decision|comment`. `_middleware.js` reads the Access identity and
  stamps every write. `_shared/attn.js` is the fold logic **ported 1:1 from `hm_attention.py`**
  (verified equal on all 56 live items).
- `cloudflare/schema.sql` — D1 tables (`documents`, `attention_items`, `attention_decisions`).
- `scripts/seed_d1.py` — emits `cloudflare/seed_attention.sql` (the small append-only rows).
- `scripts/seed_docs.py` — uploads the blob feeds via the API (bound params; dodges D1's SQL size cap).
- `wrangler.toml`, `package.json` — Pages + D1 config and npm scripts.
- The generated seed SQL and `.wrangler/` are gitignored — **runtime data never enters git.**

## Deploy — who does what
Legend: **[you]** = a human action (dashboard clicks / one login). **[claude]** = a script/command
an on-computer Cowork session can run for you.

### 0. Prereq — [you], ~2 min
Confirm the Cloudflare account for `hostmodern.co` and that you can log in. (If the domain isn't on
Cloudflare yet, that's a separate DNS move — tell me and I'll scope it.)

### 1. Authorize wrangler — [you], ~2 min
On the MacBook Pro: `npx wrangler login` (opens a browser, approve). One time.

### 2. Create the database — [claude], 1 command
`npx wrangler d1 create hm-command-center` → paste the returned `database_id` into `wrangler.toml`.

### 3. Create schema + seed — [claude], 3 commands
```
npm run db:schema                    # create tables (remote D1)
python3 scripts/seed_d1.py           # generate seed_attention.sql from the live pool
npm run db:seed                      # load items + decisions
# blob feeds get loaded in step 6 once the site is up (they need the API)
```

### 4. Create the Pages project + connect the repo — [you], ~5 min
Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git →
`gabecoyne/hm-command-center`, production branch `main` (or `cc/cloudflare-ready` to trial first).
Build command: none. Output dir: `/`. Then Settings → Functions → D1 bindings → add
`DB` → `hm-command-center`.

### 5. Turn on Access with Google — [you], ~10 min
Dashboard → Zero Trust → Access → Applications → Add → Self-hosted → your Pages URL.
Identity provider: Google (approve the Google Workspace consent once). Policy: Allow →
emails `gabe@hostmodern.co`, `collin@hostmodern.co`. This is the "who's logged in" layer —
no code, and it's what stamps each person's writes.

### 6. Load the blob feeds — [claude], 1 command
Once the site is live: `python3 scripts/seed_docs.py https://<your-pages-url>`
(with `CF_ACCESS_CLIENT_ID/SECRET` for a service token, created in step 7). Uploads
ecomm_state, event_log, schedule, dashboard, model, etc.

### 7. Machine service token (so the Mac can push up) — [you], ~5 min
Zero Trust → Access → Service Tokens → Create (`hm-machine-runner`). Add an Access policy on the
app that allows that token. Put the client id/secret in `Config/cloudflare_config.env`. The
MacBook Pro's tasks then `POST /api/attention/item` etc. with those two headers instead of
writing Drive JSON.

## Your total hands-on time
**~25 minutes, all one-time**, across four dashboard tasks (account check, connect repo, turn on
Access+Google, create a service token) plus one `wrangler login`. Everything else is scripted. After
that, deploys are `git push` (Pages auto-builds) and I run the seed/collector migrations.

## What still needs the MacBook Pro after this
Cloudflare hosts the data, UI, auth, and the pure-API collectors. The **browser tasks** (social
comments) and **Claude-reasoning agents** (media buyer, allocation, EA, Trybe) still run on the
always-on Mac — they just POST results to the API (step 7) instead of writing Drive files.

## Verified in this branch (before deploy)
- Functions compile + all routes resolve (`wrangler pages functions build`).
- Fold logic JS == Python `fold_state` on all 56 live items (status, awaiting, ack, decision, thread).
- D1 schema applies; 56 items + 36 decisions seed and query; documents upsert/conflict path.
- NOT yet run: the live HTTP server end-to-end (the sandbox can't boot `wrangler pages dev`).
  **First real check on your Mac: `npm run dev` then open http://127.0.0.1:8788** — it should look
  identical to today's Command Center, reading from local D1.
