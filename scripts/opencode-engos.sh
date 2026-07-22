#!/bin/bash
# Engineering OS — opencode fork wrapper
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
ENGOS_DIR="/root/opencode-engos"
BUN="$HOME/.bun/bin/bun"
PROJ_FILE="/tmp/opencode-project"
OPENCODE_ENTRY="$ENGOS_DIR/packages/opencode/src/index.ts"

# Collect flags
BUN_FLAGS=""
WATCH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --pure|--print-logs|--no-install) BUN_FLAGS="$BUN_FLAGS $1"; shift ;;
    --watch) WATCH="--watch"; shift ;;
    -*) shift ;;
    *) break ;;
  esac
done

# Determine initial project directory
PROJECT_DIR=""
if [ $# -ge 1 ] && [ -d "$1" ]; then
  PROJECT_DIR="$1"
elif [ $# -ge 1 ]; then
  # Non-directory arg — treat as prompt
  cd "$ENGOS_DIR/packages/opencode" 2>/dev/null
  exec $BUN $WATCH run $BUN_FLAGS --conditions=browser ./src/index.ts run "$@"
fi

# Main loop: always run bun from the opencode dir, pass project dir as arg
while true; do
  rm -f "$PROJ_FILE"

  cd "$ENGOS_DIR/packages/opencode" 2>/dev/null

  if [ -n "$PROJECT_DIR" ]; then
    $BUN $WATCH run $BUN_FLAGS --conditions=browser ./src/index.ts "$PROJECT_DIR"
  else
    $BUN $WATCH run $BUN_FLAGS --conditions=browser ./src/index.ts
  fi

  # Check if TUI wrote a new project path before exiting
  if [ -f "$PROJ_FILE" ]; then
    NEW_DIR=$(cat "$PROJ_FILE" 2>/dev/null)
    rm -f "$PROJ_FILE"
    if [ -n "$NEW_DIR" ] && [ -d "$NEW_DIR" ] && [ "$NEW_DIR" != "/browse" ]; then
      PROJECT_DIR="$NEW_DIR"
      continue
    fi
    [ "$NEW_DIR" = "/browse" ] && continue
  fi

  # No project switch — exit
  break
done