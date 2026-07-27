#!/bin/bash
# Gera ícones para InnexarCode a partir do SVG
set -e

ICONS_DIR="/root/opencode-engos/packages/desktop/resources/icons"
SVG_FILE="/tmp/innexar-icon.svg"

# SVG base para o ícone (quadrado, sem texto)
cat > "$SVG_FILE" << 'SVGEOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#0f0f1a"/>
    </linearGradient>
    <linearGradient id="fg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#818cf8"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="120" fill="url(#bg)"/>
  <!-- < bracket -->
  <path d="M160 256L220 196V220L190 256L220 292V316L160 256Z" fill="url(#fg)"/>
  <!-- I -->
  <rect x="236" y="156" width="40" height="200" rx="12" fill="url(#fg)"/>
  <!-- > bracket -->
  <path d="M352 256L292 316V292L322 256L292 220V196L352 256Z" fill="url(#fg)"/>
</svg>
SVGEOF

echo "📐 Gerando PNGs em vários tamanhos..."

# Gerar PNGs com rsvg-convert ou inkscape ou magick
if command -v rsvg-convert &>/dev/null; then
  for size in 32 64 128 256 512; do
    out="${ICONS_DIR}/${size}x${size}.png"
    rsvg-convert -w "$size" -h "$size" "$SVG_FILE" > "$out" 2>/dev/null
    echo "   ${size}x${size} ✓ ($(du -h "$out" | cut -f1))"
  done
  rsvg-convert -w 256 -h 256 "$SVG_FILE" > "${ICONS_DIR}/icon.png" 2>/dev/null
  rsvg-convert -w 256 -h 256 "$SVG_FILE" > "${ICONS_DIR}/dock.png" 2>/dev/null
  echo "   icon.png + dock.png ✓"
elif command -v magick &>/dev/null; then
  magick "$SVG_FILE" -resize 256x256 "${ICONS_DIR}/icon.png"
  magick "$SVG_FILE" -resize 256x256 "${ICONS_DIR}/dock.png"
  magick "$SVG_FILE" -define icon:auto-resize=32,64,128,256 "${ICONS_DIR}/icon.ico"
  echo "   .ico + .png ✓"
fi

echo "✅ Ícones gerados em ${ICONS_DIR}/"
ls -lh "${ICONS_DIR}/" | grep -v "android\|ios\|linux"
