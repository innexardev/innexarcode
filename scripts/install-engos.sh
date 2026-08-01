#!/usr/bin/env bash
# Engineering OS — Instalador para máquina nova
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[38;5;214m'
NC='\033[0m'

GIT_REPO="${ENGOS_REPO:-git@github.com-innexardev:innexardev/innexarcode.git}"
BRANCH="${ENGOS_BRANCH:-dev}"
INSTALL_DIR="${ENGOS_DIR:-$HOME/opencode-engos}"
BUN_INSTALL_DIR="$HOME/.bun"

echo -e "${GREEN}==> Engineering OS Installer${NC}"
echo "    Repo: $GIT_REPO (branch: $BRANCH)"
echo "    Destino: $INSTALL_DIR"
echo ""

# 1. Dependências base
echo -e "${YELLOW}==> Verificando dependências...${NC}"
for cmd in git curl unzip; do
  if ! command -v $cmd >/dev/null 2>&1; then
    echo -e "${RED}ERRO: '$cmd' não está instalado. Instale primeiro (apt install $cmd).${NC}"
    exit 1
  fi
done

# 2. Bun
if [ ! -x "$BUN_INSTALL_DIR/bin/bun" ]; then
  echo -e "${YELLOW}==> Instalando Bun...${NC}"
  curl -fsSL https://bun.sh/install | bash
else
  echo -e "${GREEN}==> Bun já instalado: $($BUN_INSTALL_DIR/bin/bun --version)${NC}"
fi
export PATH="$BUN_INSTALL_DIR/bin:$PATH"

# 3. Clone do repositório
if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "${YELLOW}==> Repositório já existe. Atualizando...${NC}"
  cd "$INSTALL_DIR"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull origin "$BRANCH" || true
else
  echo -e "${YELLOW}==> Clonando repositório...${NC}"
  git clone --branch "$BRANCH" --depth 1 "$GIT_REPO" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# 4. Instalar dependências
echo -e "${YELLOW}==> Instalando dependências (bun install)...${NC}"
cd "$INSTALL_DIR"
bun install

# 5. Criar wrapper
echo -e "${YELLOW}==> Criando wrapper /usr/local/bin/opencode-engos...${NC}"
cat > /usr/local/bin/opencode-engos << 'WRAPPER'
#!/bin/bash
# Engineering OS — opencode fork wrapper (auto-update aware)
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
ENGOS_DIR="__ENGOS_DIR__"
BUN="$HOME/.bun/bin/bun"
PROJ_FILE="/tmp/opencode-project"
OPENCODE_ENTRY="$ENGOS_DIR/packages/opencode/src/index.ts"

# Checa atualização em background (não bloqueia)
if [ -f "$ENGOS_DIR/scripts/engos-update.sh" ]; then
  nohup "$ENGOS_DIR/scripts/engos-update.sh" --silent >> /tmp/engos-update.log 2>&1 &
fi

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

PROJECT_DIR=""
if [ $# -ge 1 ] && [ -d "$1" ]; then
  PROJECT_DIR="$1"
elif [ $# -ge 1 ]; then
  cd "$ENGOS_DIR/packages/opencode" 2>/dev/null
  exec $BUN $WATCH run $BUN_FLAGS --conditions=browser ./src/index.ts run "$@"
fi

while true; do
  rm -f "$PROJ_FILE"
  cd "$ENGOS_DIR/packages/opencode" 2>/dev/null

  if [ -n "$PROJECT_DIR" ]; then
    $BUN $WATCH run $BUN_FLAGS --conditions=browser ./src/index.ts "$PROJECT_DIR"
  else
    $BUN $WATCH run $BUN_FLAGS --conditions=browser ./src/index.ts
  fi

  if [ -f "$PROJ_FILE" ]; then
    NEW_DIR=$(cat "$PROJ_FILE" 2>/dev/null)
    rm -f "$PROJ_FILE"
    if [ -n "$NEW_DIR" ] && [ -d "$NEW_DIR" ]; then
      PROJECT_DIR="$NEW_DIR"
      continue
    fi
  fi
  break
done
WRAPPER
sed -i "s|__ENGOS_DIR__|$INSTALL_DIR|" /usr/local/bin/opencode-engos
chmod +x /usr/local/bin/opencode-engos

# 6. Instalar systemd timer para atualização automática
echo -e "${YELLOW}==> Instalando systemd timer (auto-update)...${NC}"
cat > /etc/systemd/system/engos-update.service << EOF
[Unit]
Description=Engineering OS auto-update
After=network-online.target

[Service]
Type=oneshot
ExecStart=$INSTALL_DIR/scripts/engos-update.sh
EOF

cat > /etc/systemd/system/engos-update.timer << EOF
[Unit]
Description=Check for Engineering OS updates every 6 hours

[Timer]
OnBootSec=5min
OnUnitActiveSec=6h
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload 2>/dev/null && systemctl enable engos-update.timer 2>/dev/null && systemctl start engos-update.timer 2>/dev/null || true

echo ""
echo -e "${GREEN}==> Instalação concluída!${NC}"
echo "    Execute 'opencode-engos' para iniciar."
echo "    Atualizações automáticas: a cada 6h + a cada execução."
