#!/bin/bash
# HM Command Center — double-click to launch (or run to relaunch).
cd "$(dirname "$0")"

# Point the server at the LIVE shared Drive data pool + Scripts, so it serves this repo's code
# against the real attention queue (and the new /api/attention/comment reply endpoint works).
# Each var is overridable from the environment; these are the defaults for Gabe's machine.
HM_ROOT="${HM_ROOT:-$HOME/Library/CloudStorage/GoogleDrive-gabe@hostmodern.co/Shared drives/Host Modern/Claude/Host Modern}"
export CC_DATA="${CC_DATA:-$HM_ROOT/data}"
export HM_SCRIPTS="${HM_SCRIPTS:-$HM_ROOT/Scripts}"
export CC_PORT="${CC_PORT:-8787}"

# Free the port if a previous server is still holding it, so relaunch is a clean restart.
lsof -ti:"$CC_PORT" 2>/dev/null | xargs kill 2>/dev/null && sleep 1

python3 server.py &
SRV=$!
sleep 1
open "http://localhost:${CC_PORT}"
echo "Command Center running (pid $SRV) on port ${CC_PORT}."
echo "  data    : $CC_DATA"
echo "  scripts : $HM_SCRIPTS"
echo "Close this window or Ctrl-C to stop."
wait $SRV
