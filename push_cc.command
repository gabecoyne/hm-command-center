#!/bin/bash
# One-shot: commit + push the Command Center Feedback-drawer changes.
# Runs on the Mac (native git + keychain creds). Safe to delete after.
cd "$HOME/dev/hm-command-center" || { echo "repo not found"; exit 1; }
rm -f .git/index.lock
echo "== pull =="; git pull --ff-only || { echo "pull failed"; read -n1 -p "press any key"; exit 1; }
git rm -q src/views/Attention.js 2>/dev/null
git add -A
echo "== commit =="; git commit -m "Feedback drawer (hypotheses/feedback/runs/contracts) + Attention->Feedback rename + modular cutover"
echo "== push =="; git push origin main
echo ""; echo "DONE ($?). You can close this window."; read -n1 -p "press any key to close"
