#!/usr/bin/env python3
"""Internal, bounded HTTP responder for the single public drill route."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import time

PAGE = b'<!doctype html><html lang="en"><title>Scheduled outage drill</title><h1>Drill endpoint healthy</h1></html>\n'


def response(directory, region, now_ms):
    """Malformed/expired state cannot keep a planned fault running."""
    try:
        with (directory / "state.json").open("rb") as stream:
            state = json.loads(stream.read(4096))
        mode = state.get("mode")
        start, end = state.get("start"), state.get("end")
        valid = (type(start) is int and type(end) is int and 0 < end - start <= 1_200_000)
        if valid and start <= now_ms < end:
            if mode in ("outage", "blip"):
                return 404, b"Planned demo fault\n", 0
            if mode == "regional" and region == state.get("failedRegion") and region in ("eu-west-1", "us-east-1"):
                return 503, b"Planned regional demo fault\n", 0
            delay = state.get("delayMs")
            if mode == "slow" and type(delay) is int and 2000 <= delay <= 4000:
                return 200, PAGE, min(delay, end - now_ms) / 1000
        # Expired state returns healthy even if a killed process left the file absent.
        if mode != "healthy":
            return 200, PAGE, 0
        return (200, PAGE, 0) if (directory / "status.html").is_file() else (404, b"Not found\n", 0)
    except (OSError, ValueError, AttributeError):
        return 200, PAGE, 0


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(2)

    def do_GET(self):
        if self.path == "/ready":
            status, body, delay = 200, b"UP\n", 0
        elif self.path == "/drill/status.html":
            status, body, delay = response(self.server.directory, self.headers.get("X-RCP-Probe-Region"), int(time.time() * 1000))
        else:
            status, body, delay = 404, b"Not found\n", 0
        if delay:
            time.sleep(delay)
        try:
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass

    do_HEAD = do_GET

    def log_message(self, *args):
        pass  # Never retain client headers or per-request data.


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 16

    def __init__(self, address, directory):
        self.directory = directory
        self.slots = threading.BoundedSemaphore(16)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path("/srv/drill"))
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    Server(("0.0.0.0", args.port), args.directory).serve_forever()
