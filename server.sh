#!/usr/bin/env bash
# Usage: ./server.sh start | stop | restart | status

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.server.pid"
LOG_FILE="$DIR/.server.log"
PYTHON="$DIR/venv/bin/python3"

is_running() {
    [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

start() {
    if is_running; then
        echo "Already running (PID $(cat "$PID_FILE")), restarting…"
        stop
    fi
    nohup "$PYTHON" "$DIR/app.py" >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "Started (PID $!)"
}

stop() {
    if ! is_running; then
        echo "Not running"
        return
    fi
    local pid i=0
    pid=$(cat "$PID_FILE")
    kill "$pid"
    while kill -0 "$pid" 2>/dev/null && [ $i -lt 20 ]; do
        sleep 0.1; i=$((i + 1))
    done
    rm -f "$PID_FILE"
    echo "Stopped"
}

case "${1:-}" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; sleep 1; start ;;
    status)  is_running && echo "Running (PID $(cat "$PID_FILE"))" || echo "Stopped" ;;
    *)       echo "Usage: $0 start|stop|restart|status"; exit 1 ;;
esac
