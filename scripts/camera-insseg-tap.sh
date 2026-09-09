#!/bin/bash
# Temporary, invasive INSSEG observation on the camera board; no installation or service changes.
# Upload with SFTP, then in the camera SSH terminal: bash camera-insseg-tap.sh check
# Start bounded output: bash camera-insseg-tap.sh stream 180
# Optional explicit camera-side log: bash camera-insseg-tap.sh capture 30
# strace/ptrace can affect ALL appMain threads and timing. Use only with the vehicle stationary.
# SSH loss is not immediate cleanup: the remote timeout bounds tracing to at most 180s + kill grace.
# INSSEG: timestamp,index,picIndex,num,[P_XX,]class,track,left,top,right,bottom,distance,azimuth...*XOR
# Historical observations (NOT a full-count guarantee): trackID 70000 is the follow target;
# other targets may be filtered to <=1.5m. Verify full person reporting before calibration.
# RTC may be inaccurate. The host parser must validate checksum, sequence and target count.
set -uo pipefail
export LC_ALL=C
MODE="${1:-check}"
case "$MODE" in
  check|stream|capture) ;;
  help|--help|-h) echo 'Usage: bash camera-insseg-tap.sh check | stream [1..180] | capture [1..180]'; exit 0 ;;
  *) echo '[tap] ERROR: unknown mode; no tracing started' >&2; exit 2 ;;
esac
APP_PID="$(pidof appMain 2>/dev/null || true)"
if [ "$MODE" = check ]; then
  echo "appMain pid: ${APP_PID:-not running}"
  echo "strace: $(command -v strace || echo missing)"
  ls -l /dev/ttyS6 2>/dev/null || true
  if command -v fuser >/dev/null 2>&1; then fuser /dev/ttyS6 2>&1 || true; echo; fi
  exit 0
fi
DURATION="${2:-120}"
if [ "$MODE" = capture ]; then DURATION="${2:-30}"; fi
if [[ ! "$DURATION" =~ ^[1-9][0-9]{0,2}$ ]] || (( DURATION > 180 )); then
  echo '[tap] ERROR: duration must be an integer from 1 to 180 seconds' >&2; exit 2
fi
if [[ ! "$APP_PID" =~ ^[0-9]+$ ]]; then
  echo '[tap] ERROR: expected exactly one running appMain' >&2; exit 1
fi
for tool in strace timeout readlink; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[tap] ERROR: missing $tool; nothing will be installed" >&2; exit 1
  fi
done
if ! strace -y -V >/dev/null 2>&1; then
  echo '[tap] ERROR: strace must support -y FD path decoding' >&2; exit 1
fi
FOUND=0
for fd in /proc/"$APP_PID"/fd/*; do
  if [ "$(readlink "$fd" 2>/dev/null || true)" = /dev/ttyS6 ]; then FOUND=1; break; fi
done
if [ "$FOUND" != 1 ]; then echo '[tap] ERROR: appMain has no ttyS6 descriptor' >&2; exit 1; fi
if [ "$MODE" = capture ]; then
  OUT="$(mktemp /tmp/insseg-XXXXXXXX.log)" || exit 1
  echo "[tap] capture -> $OUT (delete manually after retrieval)" >&2
  exec > "$OUT"
fi
TRACE_PID_OWN=''
cleanup() {
  if [ -n "$TRACE_PID_OWN" ]; then
    kill -TERM "$TRACE_PID_OWN" 2>/dev/null || true
    wait "$TRACE_PID_OWN" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
coproc TRACE { exec timeout -k 2 "$DURATION" strace -f -q -y -p "$APP_PID" -e trace=write -s 16384 2>&1; }
TRACE_PID_OWN="$TRACE_PID"
exec {TRACE_FD}<&"${TRACE[0]}"
PATTERN='write\([0-9]+</dev/ttyS6>, "([^"]*)", ([0-9]+)\) += ([0-9]+)$'
FRAMES=0
while IFS= read -r trace_line <&"$TRACE_FD"; do
  if [[ "$trace_line" == *'strace:'* ]]; then echo "[tap] $trace_line" >&2; fi
  if [[ "$trace_line" != *'</dev/ttyS6>'* ]]; then continue; fi
  if [[ ! "$trace_line" =~ $PATTERN ]]; then
    echo '[tap] ERROR: unsupported/incomplete ttyS6 write; stopping rather than guessing' >&2; exit 1
  fi
  payload="${BASH_REMATCH[1]}"
  requested="${BASH_REMATCH[2]}"
  written="${BASH_REMATCH[3]}"
  if [ "$requested" != "$written" ]; then echo '[tap] ERROR: short write' >&2; exit 1; fi
  if [[ "$payload" != *'$ESTAR,INSSEG'* ]]; then continue; fi
  decoded="${payload//\\r/$'\r'}"
  decoded="${decoded//\\n/$'\n'}"
  if [[ "$decoded" == *'\'* ]] || [ "${#decoded}" != "$written" ] || [[ "$decoded" != *$'\r\n' ]]; then
    echo '[tap] ERROR: truncated, split or unsupported escaped INSSEG write' >&2; exit 1
  fi
  rest="$decoded"
  while [ -n "$rest" ]; do
    packet="${rest%%$'\r\n'*}"
    if [[ ! "$packet" =~ ^\$ESTAR,INSSEG,[A-Za-z0-9_,.+-]+\*[0-9a-fA-F]{2}$ ]]; then
      echo '[tap] ERROR: mixed or malformed INSSEG write' >&2; exit 1
    fi
    rest="${rest#*$'\r\n'}"
    printf '%s\r\n' "$packet" || exit 1
    FRAMES=$((FRAMES + 1))
  done
done
exec {TRACE_FD}<&-
wait "$TRACE_PID_OWN"
RC=$?
TRACE_PID_OWN=''
if [ "$RC" != 0 ] && [ "$RC" != 124 ]; then echo "[tap] ERROR: tracer exited $RC" >&2; exit "$RC"; fi
if [ "$FRAMES" = 0 ]; then echo '[tap] ERROR: no complete INSSEG frames received' >&2; exit 1; fi
echo "[tap] finished: $FRAMES frames; tracer detached" >&2
