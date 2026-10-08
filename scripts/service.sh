#!/usr/bin/env bash
# Gerencia o Streaming como serviço do systemd de usuário (Linux): sobe sozinho ao fazer login,
# reinicia se cair e ganha um atalho "Streaming" no menu de aplicativos.
#
#   npm run service -- install [porta]   instala, habilita e inicia (porta padrão: 3000)
#   npm run service -- update            recompila e reinicia (use após mudar o código)
#   npm run service -- status | logs | open | start | stop | restart
#   npm run service -- uninstall         remove o serviço e o atalho
set -euo pipefail

NAME=streaming
PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/$NAME.service"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP="$APP_DIR/$NAME.desktop"
ctl() { systemctl --user "$@"; }

port_of_unit() { grep -oP '^Environment=PORT=\K[0-9]+' "$UNIT" 2>/dev/null || echo 3000; }
port_busy() { ss -ltn 2>/dev/null | grep -qE "[:.]$1\s"; }

need_systemd() {
  # "degraded" (alguma outra unidade falhou) é normal e não impede o uso; só importa o gerenciador responder.
  command -v systemctl >/dev/null && ctl show-environment >/dev/null 2>&1 || {
    echo "systemd de usuário não está disponível nesta sessão." >&2; exit 1; }
}

build() {
  echo "▶ Compilando (npm run build)…"
  (cd "$PROJECT" && npm run build)
}

wait_http() {
  local port=$1
  for _ in $(seq 1 40); do
    curl -fsS -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}

cmd_install() {
  need_systemd
  local port="${1:-3000}"
  [[ "$port" =~ ^[0-9]+$ ]] || { echo "Porta inválida: $port" >&2; exit 1; }
  command -v ffmpeg >/dev/null || echo "⚠ ffmpeg não encontrado no PATH: o player não conseguirá remuxar MKV."
  [ -f "$PROJECT/.next/BUILD_ID" ] || build

  mkdir -p "$UNIT_DIR" "$APP_DIR"
  cat > "$UNIT" <<UNIT_EOF
[Unit]
Description=Streaming pessoal (servidor local)
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT
Environment=NODE_ENV=production
Environment=PORT=$port
ExecStart=$(command -v node) $PROJECT/node_modules/next/dist/bin/next start -H 127.0.0.1 -p $port
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
UNIT_EOF

  cat > "$DESKTOP" <<DESKTOP_EOF
[Desktop Entry]
Type=Application
Name=Streaming
Comment=Meu streaming pessoal
Exec=xdg-open http://localhost:$port
Icon=video-display
Terminal=false
Categories=AudioVideo;Video;
DESKTOP_EOF

  ctl daemon-reload
  ctl reset-failed "$NAME.service" >/dev/null 2>&1 || true
  ctl enable "$NAME.service" >/dev/null 2>&1
  echo "✓ Serviço instalado e habilitado (sobe sozinho a cada login)."

  if ctl is-active --quiet "$NAME.service"; then
    ctl restart "$NAME.service"
  elif port_busy "$port"; then
    echo "⚠ A porta $port já está em uso (talvez um 'npm run dev' aberto num terminal)."
    echo "  Feche esse terminal e rode:  npm run service -- start"
    return 0
  else
    ctl start "$NAME.service"
  fi
  if wait_http "$port"; then echo "✓ No ar: http://localhost:$port  (atalho 'Streaming' no menu de aplicativos)"
  else echo "✗ Não respondeu em 40 s. Veja: npm run service -- logs" >&2; exit 1; fi
}

cmd_update() {
  need_systemd
  build
  if ctl is-active --quiet "$NAME.service"; then
    ctl restart "$NAME.service"
    wait_http "$(port_of_unit)" && echo "✓ Atualizado e reiniciado." || { echo "✗ Não voltou a responder. Veja os logs." >&2; exit 1; }
  else
    echo "✓ Compilado. O serviço não está rodando (npm run service -- start)."
  fi
}

cmd_uninstall() {
  need_systemd
  ctl disable --now "$NAME.service" >/dev/null 2>&1 || true
  rm -f "$UNIT" "$DESKTOP"
  ctl daemon-reload
  ctl reset-failed "$NAME.service" >/dev/null 2>&1 || true
  echo "✓ Serviço e atalho removidos. Seus dados (data/) continuam intactos."
}

case "${1:-}" in
  install)   shift; cmd_install "$@" ;;
  update)    cmd_update ;;
  uninstall) cmd_uninstall ;;
  start)     need_systemd; port_busy "$(port_of_unit)" && ! ctl is-active --quiet "$NAME.service" && { echo "Porta $(port_of_unit) em uso por outro processo." >&2; exit 1; }; ctl start "$NAME.service"; wait_http "$(port_of_unit)" && echo "✓ http://localhost:$(port_of_unit)" ;;
  stop|restart) need_systemd; ctl "$1" "$NAME.service"; echo "✓ $1" ;;
  status)    ctl status "$NAME.service" --no-pager || true ;;
  logs)      journalctl --user -u "$NAME.service" -n 80 --no-pager ;;
  open)      xdg-open "http://localhost:$(port_of_unit)" ;;
  *) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
