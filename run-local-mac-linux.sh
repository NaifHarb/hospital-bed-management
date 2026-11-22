#!/bin/sh
cd "$(dirname "$0")" || exit 1
( sleep 2; if command -v open >/dev/null; then open http://localhost:8765/docs/; elif command -v xdg-open >/dev/null; then xdg-open http://localhost:8765/docs/; fi ) &
python3 -m http.server 8765
