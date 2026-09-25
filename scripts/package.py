# SPDX-License-Identifier: GPL-2.0-only
"""Build a deterministic portable ZIP, using only Python's standard library."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def package(destination=None):
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    destination = Path(destination) if destination is not None else ROOT / 'release'
    destination.mkdir(parents=True, exist_ok=True)
    archive = destination / f'music-gay-{version}-portable.zip'
    entries = {
        '音乐转调.html': 'dist/index.html',
        '启动音乐转调.cmd': '启动音乐转调.cmd',
        'music_transposer_server.py': 'music_transposer_server.py',
        '使用说明.md': 'docs/QUICKSTART.md',
        'LICENSE': 'LICENSE',
        'THIRD_PARTY_NOTICES.md': 'THIRD_PARTY_NOTICES.md',
        'rubberband-source.tar.gz': 'vendor/rubberband/rubberband-source.tar.gz',
    }
    for source in entries.values():
        if not (ROOT / source).is_file():
            raise FileNotFoundError(f'Missing {source}; run node scripts/build.mjs first')
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for target, source in sorted(entries.items()):
            content = (ROOT / source).read_bytes()
            if target.endswith('.cmd'):
                content = content.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
            info = zipfile.ZipInfo(target, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            output.writestr(info, content, compresslevel=9)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (destination / 'SHA256SUMS.txt').write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
    return archive


if __name__ == '__main__':
    print(package())
