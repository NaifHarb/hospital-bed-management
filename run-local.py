"""Launch the offline demo on IPv4 loopback using only the Python standard library."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
from threading import Thread
import webbrowser


def main():
    url = "http://localhost:8765/docs/"
    handler = partial(SimpleHTTPRequestHandler, directory=Path(__file__).resolve().parent)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", 8765), handler)
    except OSError as error:
        print(f"Could not start the local server on port 8765: {error}", file=sys.stderr)
        return 1

    with server:
        print(f"Open {url} in Edge or Chrome. Press Ctrl+C to stop.", flush=True)
        Thread(target=webbrowser.open, args=(url,), daemon=True).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
