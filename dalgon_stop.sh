#!/bin/bash

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

stopped=false

for pid in $(pgrep -f '[n]ode .*dist/app\.js' || true); do
  echo "Stopping Dalgon process $pid"
  kill "$pid" 2>/dev/null && stopped=true
 done

for pid in $(pgrep -f '[n]grok http 3000' || true); do
  echo "Stopping ngrok process $pid"
  kill "$pid" 2>/dev/null && stopped=true
 done

if [[ "$(pgrep -f '[n]ode .*dist/app\.js' || true)" || "$(pgrep -f '[n]grok http 3000' || true)" ]]; then
  echo "Waiting for processes to stop..."
  sleep 2
fi

if command -v crontab >/dev/null 2>&1; then
  temp_cron="$SCRIPT_DIR/temp_cron"
  if crontab -l > "$temp_cron" 2>/dev/null; then
    sed -i -E '/dalgon_log_archiver/d' "$temp_cron"
    crontab "$temp_cron"
  fi
  rm -f "$temp_cron"
fi

if [[ "$stopped" == true ]]; then
  echo "Dalgon stopped."
else
  echo "No Dalgon or ngrok process was running."
fi
