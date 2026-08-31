#!/bin/sh

set -eu

API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3002}"

port_is_busy() {
  lsof -tiTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

if port_is_busy "$API_PORT"; then
  echo "Le port API $API_PORT est déjà occupé. Arrêtez l'ancien serveur LFPB avant de relancer." >&2
  exit 1
fi

if port_is_busy "$WEB_PORT"; then
  echo "Le port Web $WEB_PORT est déjà occupé. Arrêtez l'ancienne interface LFPB avant de relancer." >&2
  exit 1
fi

cleanup() {
  trap - INT TERM EXIT
  kill "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
  wait "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo "API LFPB : http://localhost:$API_PORT/api/v1"
echo "Web LFPB : http://localhost:$WEB_PORT"

API_PORT="$API_PORT" pnpm --filter @lfpb/api dev &
API_PID=$!

pnpm --filter @lfpb/web exec next dev -p "$WEB_PORT" &
WEB_PID=$!

wait "$API_PID" "$WEB_PID"
