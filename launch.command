#!/bin/bash
# HM Command Center — double-click to launch.
cd "$(dirname "$0")"
python3 server.py &
SRV=$!
sleep 1
open "http://localhost:${CC_PORT:-8787}"
echo "Command Center running (pid $SRV). Close this window or Ctrl-C to stop."
wait $SRV
