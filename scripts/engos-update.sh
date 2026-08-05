#!/usr/bin/env bash
# Engineering OS — auto-update script
# Puxa mudanças do git, instala dependências e reporta.
set -uo pipefail

ENGOS_DIR="${ENGOS_DIR:-$(dirname "$(dirname "$(realpath "$0")")")}"
BRANCH="dev"
LOG="/tmp/engos-update.log"
LOCK="/tmp/engos-update.lock"

SILENT=""
[ "${1:-}" = "--silent" ] && SILENT=1

log() {
  local msg="$(date -u +"%Y-%m-%dT%H:%M:%SZ") $*"
  echo "$msg" >> "$LOG"
  [ -z "$SILENT" ] && echo "$msg"
}

# Evita execução concorrente
if [ -f "$LOCK" ]; then
  PID=$(cat "$LOCK" 2>/dev/null)
  if kill -0 "$PID" 2>/dev/null; then
    log "update já em execução (PID $PID), saindo"
    exit 0
  fi
  rm -f "$LOCK"
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

# Não atualizar durante uma sessão ativa do TUI? — git pull é seguro, bun install pode atrapalhar.
# Verifica se alguma sessão opencode está rodando
RUNNING=$(pgrep -f "packages/opencode/src/index.ts" | head -1 || true)

cd "$ENGOS_DIR" || { log "ERRO: diretório $ENGOS_DIR não encontrado"; exit 1; }

# Branch atual
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  log "branch atual ($CURRENT_BRANCH) != $BRANCH, ignorando"
  exit 0
fi

# Fetch remoto
git fetch origin "$BRANCH" >> "$LOG" 2>&1 || { log "ERRO: git fetch falhou"; exit 1; }

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/"$BRANCH" 2>/dev/null || echo "")

if [ -z "$REMOTE" ] || [ "$LOCAL" = "$REMOTE" ]; then
  log "já está atualizado ($LOCAL)"
  exit 0
fi

log "atualização disponível: $LOCAL -> $REMOTE"

# Se TUI está rodando, apenas registra; aplica na próxima execução (timer 6h)
if [ -n "$RUNNING" ]; then
  log "TUI em execução, atualização aplicada na próxima janela"
  exit 0
fi

log "aplicando atualização..."
git checkout "$BRANCH" >> "$LOG" 2>&1
git pull origin "$BRANCH" >> "$LOG" 2>&1 || { log "ERRO: git pull falhou"; exit 1; }

if command -v bun >/dev/null 2>&1; then
  bun install >> "$LOG" 2>&1 || log "AVISO: bun install falhou"
else
  ~/.bun/bin/bun install >> "$LOG" 2>&1 || log "AVISO: bun install falhou"
fi

NEW=$(git rev-parse HEAD)
log "atualização concluída: $NEW"

# Garante que o link binário exista (reboot pode removê-lo)
if ! command -v opencode-engos >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  npm rebuild -g opencode-engos-ai --silent >> "$LOG" 2>&1 || true
fi
