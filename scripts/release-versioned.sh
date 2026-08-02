#!/bin/bash
# Gera build versionado e atualiza página de download
set -e

VERSION=$(jq -r '.version' packages/desktop/package.json)
DATE_TAG=$(date -u +"%Y%m%d_%H%M")
CHANNEL="${1:-dev}"
TAG="${VERSION}-${CHANNEL}-${DATE_TAG}"

echo "🚀 Build InnexarCode $TAG"
export OPENCODE_CHANNEL="$CHANNEL"

# Build
cd packages/desktop
bun run prebuild
bun run build

# Package Windows (portable dir)
npx electron-builder --win dir --config electron-builder.config.ts

# Compactar com nome versionado
cd dist
WIN_DIR="win-unpacked"
OUT_NAME="innexarcode-${CHANNEL}-win-portable-${TAG}"
tar czf "${OUT_NAME}.tar.gz" -C "$WIN_DIR" .
echo "✅ ${OUT_NAME}.tar.gz ($(du -h "${OUT_NAME}.tar.gz" | cut -f1))"

# Copiar para download
DOWNLOAD_DIR="../../packages/web/dist/downloads"
mkdir -p "$DOWNLOAD_DIR"
cp "${OUT_NAME}.tar.gz" "$DOWNLOAD_DIR/"

# Link "latest" (sempre aponta pro último)
cp "${OUT_NAME}.tar.gz" "$DOWNLOAD_DIR/innexarcode-${CHANNEL}-win-portable-latest.tar.gz"

# Atualizar página de download com tabela de versões
cat > "$DOWNLOAD_DIR/index.html" << HTML
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Downloads — InnexarCode</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         background: #0a0a0b; color: #e4e4e7; display:flex; align-items:center;
         justify-content:center; min-height:100vh; }
  .container { max-width:800px; padding:2rem; text-align:center; }
  h1 { font-size:2rem; margin-bottom:.5rem; }
  .sub { color:#71717a; margin-bottom:2rem; }
  table { width:100%; border-collapse:collapse; text-align:left; }
  th { padding:.75rem .5rem; border-bottom:1px solid #27272a; color:#a1a1aa; font-size:.8rem; text-transform:uppercase; }
  td { padding:.75rem .5rem; border-bottom:1px solid #1f1f23; font-size:.9rem; }
  tr:hover td { background:#18181b; }
  a { color:#818cf8; text-decoration:none; }
  a:hover { text-decoration:underline; }
  .tag { display:inline-block; font-size:.7rem; padding:2px 8px; border-radius:999px; background:#1f1f23; color:#a1a1aa; }
  .latest { background:#818cf8; color:#fff; }
  .date { color:#71717a; font-size:.8rem; }
  .footer { margin-top:2rem; color:#52525b; font-size:.8rem; }
  .footer a { color:#818cf8; }
</style>
</head>
<body>
<div class="container">
  <h1>⬇️ InnexarCode</h1>
  <p class="sub">Desktop App — Downloads</p>
  <table>
    <tr><th>Versão</th><th>Plataforma</th><th>Data</th><th>Tamanho</th><th></th></tr>
HTML

# Listar versões disponíveis (ordenar por data, mais recente primeiro)
for f in \$(ls -1 innexarcode-${CHANNEL}-win-portable-*.tar.gz 2>/dev/null | sort -r); do
  SIZE=\$(du -h "\$f" | cut -f1)
  # Extrair data do nome do arquivo
  FILE_DATE=\$(echo "\$f" | grep -oP '\d{8}_\d{4}')
  FORMATTED_DATE=\$(date -d "\${FILE_DATE:0:8} \${FILE_DATE:9:2}:\${FILE_DATE:11:2}" "+%d/%m/%Y %H:%M" 2>/dev/null || echo "\$FILE_DATE")
  IS_LATEST=""
  if echo "\$f" | grep -q "latest"; then
    IS_LATEST=" <span class=\"tag latest\">latest</span>"
  fi
  cat >> "\$DOWNLOAD_DIR/index.html" << ROW
    <tr><td>\$TAG\$IS_LATEST</td><td>Windows (portátil)</td><td class="date">\$FORMATTED_DATE</td><td>\$SIZE</td><td><a href="/downloads/\$f">⬇ Baixar</a></td></tr>
ROW
done

cat >> "\$DOWNLOAD_DIR/index.html" << HTML
  </table>
  <div class="footer">
    <a href="https://github.com/innexardev/innexarcode">GitHub</a>
  </div>
</div>
</body>
</html>
HTML

echo "✅ Página de download atualizada"
