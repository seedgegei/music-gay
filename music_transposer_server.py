# SPDX-License-Identifier: GPL-2.0-only
"""Loopback-only launcher for the music transposer. Python standard library only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError
from urllib.request import build_opener, ProxyHandler

ROOT = Path(__file__).resolve().parent
STANDALONE_HTML = ROOT / '\u97f3\u4e50\u8f6c\u8c03.html'
HTML = STANDALONE_HTML if STANDALONE_HTML.is_file() else ROOT / 'dist' / 'index.html'
APP = 'pitch-room-local-v1'
IDENTITY = hashlib.sha256(str(ROOT).encode('utf-8')).hexdigest()[:20]
HTTP = build_opener(ProxyHandler({}))


def healthy(port):
    try:
        with HTTP.open(f'http://127.0.0.1:{port}/health', timeout=.5) as response:
            data = json.load(response)
            return data.get('app') == APP and data.get('identity') == IDENTITY
    except (OSError, ValueError, URLError):
        return False


def serve(port):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            route = self.path.split('?', 1)[0]
            if route == '/health':
                data = json.dumps({'app': APP, 'identity': IDENTITY}).encode()
                content_type = 'application/json'
            elif route in ('/', '/index.html'):
                try:
                    data = HTML.read_bytes()
                except OSError:
                    self.send_error(404, 'Music transposer HTML is missing.')
                    return
                content_type = 'text/html; charset=utf-8'
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    # The helper is only a local page loader; audio never leaves the browser.
    # End background helpers after eight hours; the launcher can start one again.
    expiry = threading.Timer(8 * 3600, server.shutdown)
    expiry.daemon = True
    expiry.start()
    try:
        server.serve_forever(poll_interval=.5)
    finally:
        server.server_close()
        expiry.cancel()


def edge_path():
    for environment in ('ProgramFiles(x86)', 'ProgramFiles', 'LOCALAPPDATA'):
        base = os.environ.get(environment)
        if base:
            candidate = Path(base) / 'Microsoft/Edge/Application/msedge.exe'
            if candidate.is_file():
                return str(candidate)
    return shutil.which('msedge')


def launch(port, open_browser=True):
    if not HTML.is_file():
        raise RuntimeError('Missing music page. Run node scripts/build.mjs, or keep the launcher and HTML together.')
    if not healthy(port):
        # If the preferred port belongs to another application, let Windows select a free one.
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', port))
            except OSError:
                probe.bind(('127.0.0.1', 0))
                port = probe.getsockname()[1]
        python = Path(sys.executable)
        windowless = python.with_name('pythonw.exe')
        if os.name == 'nt' and windowless.is_file():
            python = windowless
        flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
        log_path = Path(tempfile.gettempdir()) / 'pitch-room-launch.log'
        with log_path.open('ab') as log:
            child = subprocess.Popen([str(python), str(Path(__file__).resolve()), '--serve-only', '--port', str(port)],
                                     stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                     creationflags=flags, close_fds=True)
        deadline = time.monotonic() + 12
        while not healthy(port):
            if child.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError(f'Could not start the local music tool. Details: {log_path}')
            time.sleep(.15)
    url = f'http://127.0.0.1:{port}/'
    if open_browser:
        edge = edge_path()
        if edge:
            subprocess.Popen([edge, '--new-window', url], stdin=subprocess.DEVNULL,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif os.name == 'nt':
            os.startfile(url)
        else:
            import webbrowser
            webbrowser.open(url)
    if sys.stdout:
        print(url)
    return url


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--serve-only', action='store_true')
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--port', type=int, default=18765)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('--port must be between 1 and 65535')
    try:
        if args.serve_only:
            serve(args.port)
        else:
            launch(args.port, not args.no_browser)
    except Exception as error:
        if os.name == 'nt' and not args.serve_only and not args.no_browser:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, str(error), 'Music Transposer', 0x10)
        elif sys.stderr:
            print(str(error), file=sys.stderr)
        sys.exit(1)
