#!/usr/bin/env bash
# Engineering OS — Configura auto-update npm (rodar UMA vez na máquina destino)
set -e

echo "==> Configurando auto-update do opencode-engos (a cada 6h)..."

cat > /etc/systemd/system/engos-npm-update.service << 'EOF'
[Unit]
Description=Engineering OS npm auto-update
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/npm update -g opencode-engos-ai --silent
EOF

cat > /etc/systemd/system/engos-npm-update.timer << 'EOF'
[Unit]
Description=Check opencode-engos npm updates every 6 hours

[Timer]
OnBootSec=10min
OnUnitActiveSec=6h
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable engos-npm-update.timer
systemctl start engos-npm-update.timer
echo "==> OK! Timer ativo:"
systemctl list-timers engos-npm-update* | head -3
