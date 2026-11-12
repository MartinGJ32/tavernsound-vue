#!/usr/bin/env bash
# Actualiza TavernSound en la VM: trae el código nuevo, reinstala
# dependencias si cambiaron, rebuildea el frontend, y reinicia el
# servicio. Correr desde la raíz del repo, en la VM.
set -euo pipefail

echo "→ Trayendo los últimos cambios..."
git pull

echo "→ Instalando dependencias..."
npm ci

echo "→ Buildeando el frontend..."
npm run build

echo "→ Reiniciando el servicio..."
sudo systemctl restart tavernsound

echo "→ Estado del servicio:"
sudo systemctl status tavernsound --no-pager -l | head -15

echo
echo "✓ Deploy listo. Logs en vivo: sudo journalctl -u tavernsound -f"
