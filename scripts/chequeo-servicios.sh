#!/usr/bin/env bash
# Chequeo rapido de salud del stack en produccion: contenedores, motor
# Docker, logs recientes, que la API y el frontend respondan de verdad (no
# solo que el contenedor este "Up"), puertos, disco y que la base tenga los
# datos reales (no la vacia que se autogenera si se levanta el stack antes
# de restaurar backend/data — nos paso una vez, ver README).
set -uo pipefail

REPO_DIR="${REPO_DIR:-/opt/Sistema-Camaras-CURF}"
API_PORT="${API_PORT:-3088}"
FRONTEND_PORT="${FRONTEND_PORT:-8088}"
DB_MIN_BYTES=250000 # la base vacia recien migrada pesa ~204800 bytes

ok=0
fail=0

check() {
  local descripcion="$1"
  shift
  if "$@" >/tmp/chequeo-out 2>&1; then
    echo "OK   - $descripcion"
    ok=$((ok + 1))
  else
    echo "FAIL - $descripcion"
    sed 's/^/       /' /tmp/chequeo-out
    fail=$((fail + 1))
  fi
}

echo "=== Motor Docker ==="
check "servicio docker activo" systemctl is-active --quiet docker

echo
echo "=== Contenedores (docker compose ps) ==="
docker compose -f "$REPO_DIR/docker-compose.yml" ps
echo
if docker compose -f "$REPO_DIR/docker-compose.yml" ps --status running --services | grep -q api; then
  echo "OK   - contenedor api Up"; ok=$((ok + 1))
else
  echo "FAIL - contenedor api NO esta Up"; fail=$((fail + 1))
fi
if docker compose -f "$REPO_DIR/docker-compose.yml" ps --status running --services | grep -q frontend; then
  echo "OK   - contenedor frontend Up"; ok=$((ok + 1))
else
  echo "FAIL - contenedor frontend NO esta Up"; fail=$((fail + 1))
fi

echo
echo "=== Responden de verdad (HTTP) ==="
codigo_api=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${API_PORT}/api/auth/login" || echo "000")
if [ "$codigo_api" != "000" ]; then
  echo "OK   - API respondio HTTP $codigo_api en :$API_PORT"; ok=$((ok + 1))
else
  echo "FAIL - API no respondio en :$API_PORT (sin conexion)"; fail=$((fail + 1))
fi

codigo_front=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${FRONTEND_PORT}/" || echo "000")
if [ "$codigo_front" = "200" ]; then
  echo "OK   - Frontend respondio HTTP 200 en :$FRONTEND_PORT"; ok=$((ok + 1))
else
  echo "FAIL - Frontend respondio HTTP $codigo_front en :$FRONTEND_PORT (esperaba 200)"; fail=$((fail + 1))
fi

echo
echo "=== Puertos escuchando ==="
ss -tlnp 2>/dev/null | grep -E ":($API_PORT|$FRONTEND_PORT)\b" || echo "FAIL - ningun puerto $API_PORT/$FRONTEND_PORT a la escucha"

echo
echo "=== Disco ==="
df -h / | tail -1
echo "Tamano de backend/data:"
du -sh "$REPO_DIR/backend/data" 2>/dev/null

echo
echo "=== Base de datos (que no sea la vacia) ==="
db_path="$REPO_DIR/backend/data/camaras.db"
if [ -f "$db_path" ]; then
  tamano=$(stat -c%s "$db_path")
  if [ "$tamano" -ge "$DB_MIN_BYTES" ]; then
    echo "OK   - camaras.db pesa $tamano bytes (parece tener datos)"; ok=$((ok + 1))
  else
    echo "FAIL - camaras.db pesa solo $tamano bytes, podria ser una base vacia recien migrada"; fail=$((fail + 1))
  fi
else
  echo "FAIL - no existe $db_path"; fail=$((fail + 1))
fi

echo
echo "=== Ultimas lineas de log (API) ==="
docker logs sistema-camaras-api --tail 15 2>&1

echo
echo "======================================"
echo "Resumen: $ok OK, $fail FAIL"
[ "$fail" -eq 0 ]
