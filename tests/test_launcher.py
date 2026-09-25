# SPDX-License-Identifier: GPL-2.0-only
import hashlib
import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import build_opener, ProxyHandler, Request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
HTTP = build_opener(ProxyHandler({}))


class LauncherTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            cls.port = sock.getsockname()[1]
        cls.url = f'http://127.0.0.1:{cls.port}'
        cls.process = subprocess.Popen([sys.executable, str(ROOT / 'music_transposer_server.py'),
                                        '--serve-only', '--port', str(cls.port)],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            try:
                with HTTP.open(cls.url + '/health', timeout=.3) as response:
                    cls.health = json.load(response)
                return
            except (URLError, TimeoutError, OSError):
                if cls.process.poll() is not None:
                    break
                time.sleep(.1)
        cls.process.terminate()
        cls.process.wait(timeout=5)
        raise RuntimeError('Local test server did not start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)

    def test_serves_exact_built_page(self):
        with HTTP.open(self.url + '/') as response:
            self.assertEqual(response.read(), (ROOT / 'dist/index.html').read_bytes())
            self.assertIn('text/html', response.headers['Content-Type'])
            self.assertEqual(response.headers['Cache-Control'], 'no-store')

    def test_reuses_own_server_without_launching_browser(self):
        result = subprocess.run([sys.executable, str(ROOT / 'music_transposer_server.py'),
                                 '--no-browser', '--port', str(self.port)], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), self.url + '/')

    def test_other_files_are_not_exposed(self):
        for path in ['/music_transposer_server.py', '/../../LICENSE', '/.git/config']:
            with self.assertRaises(HTTPError) as error:
                HTTP.open(self.url + path)
            self.assertEqual(error.exception.code, 404)

    def test_audio_upload_is_not_accepted(self):
        with self.assertRaises(HTTPError) as error:
            HTTP.open(Request(self.url + '/', data=b'not-an-upload', method='POST'))
        self.assertEqual(error.exception.code, 501)

    def test_invalid_port_has_clear_error(self):
        result = subprocess.run([sys.executable, str(ROOT / 'music_transposer_server.py'),
                                 '--no-browser', '--port', '0'], capture_output=True, text=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('between 1 and 65535', result.stderr)


class PackageTests(unittest.TestCase):
    def test_portable_bundle_is_complete_and_reproducible(self):
        spec = importlib.util.spec_from_file_location('packaging_script', ROOT / 'scripts/package.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory(prefix='music-gay-test-') as folder:
            archive = module.package(folder)
            first = hashlib.sha256(archive.read_bytes()).hexdigest()
            self.assertEqual(first, hashlib.sha256(module.package(folder).read_bytes()).hexdigest())
            with zipfile.ZipFile(archive) as bundle:
                self.assertEqual(bundle.read('音乐转调.html'), (ROOT / 'dist/index.html').read_bytes())
                self.assertIn('LICENSE', bundle.namelist())
                self.assertIn('rubberband-source.tar.gz', bundle.namelist())
                self.assertTrue(bundle.read('启动音乐转调.cmd').startswith(b'@echo off\r\n'))
                self.assertNotIn('.git/config', bundle.namelist())
                bundle.extractall(folder)
            spec = importlib.util.spec_from_file_location('bundled_launcher', Path(folder) / 'music_transposer_server.py')
            bundled = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(bundled)
            self.assertEqual(bundled.HTML, (Path(folder) / '音乐转调.html').resolve())


if __name__ == '__main__':
    unittest.main()
