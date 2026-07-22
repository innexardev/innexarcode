#!/bin/bash
# Engineering OS — opencode fork wrapper
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
ENGOS_DIR="/root/opencode-engos"
BUN="$HOME/.bun/bin/bun"
PROJ_FILE="/tmp/opencode-project"

cd "$ENGOS_DIR/packages/opencode" 2>/dev/null

# Collect flags that bun should receive
BUN_FLAGS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --pure|--print-logs|--no-install) BUN_FLAGS="$BUN_FLAGS $1"; shift ;;
    --watch) WATCH="--watch"; shift ;;
    -*) shift ;; # skip other flags
    *) break ;;
  esac
done

# If path argument, open that project
if [ $# -ge 1 ] && [ -d "$1" ]; then
  rm -f "$PROJ_FILE"
  exec $BUN $WATCH run $BUN_FLAGS --conditions=browser ./src/index.ts "$@"
elif [ $# -ge 1 ]; then
  rm -f "$PROJ_FILE"
  exec $BUN $WATCH run $BUN_FLAGS --conditions=browser ./src/index.ts run "$@"
fi

# No path: show launcher, loop for project selection
while true; do
  rm -f "$PROJ_FILE"
  $BUN $WATCH run $BUN_FLAGS --conditions=browser ./src/index.ts

  if [ -f "$PROJ_FILE" ]; then
    SELECTED=$(cat "$PROJ_FILE")
    rm -f "$PROJ_FILE"

    if [ "$SELECTED" = "/browse" ]; then
      # Browse mode: re-launch with --browse flag? For now just continue
      continue
    elif [ -d "$SELECTED" ]; then
      cd "$ENGOS_DIR/packages/opencode" 2>/dev/null
      exec $BUN $WATCH run $BUN_FLAGS --conditions=browser ./src/index.ts "$SELECTED"
    fi
  else
    break
  fi
done
