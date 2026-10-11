#!/usr/bin/env python3
"""Opt an existing private application configuration into the ten-monitor demo
and a separate demo ceiling of 15; visitor limits become 5 per owner / 30 total."""
import argparse
import json
import os
from pathlib import Path
import stat
import tempfile

TARGETS = ('GitHub Status|https://www.githubstatus.com/api/v2/status.json',
           'Cloudflare Status|https://www.cloudflarestatus.com/api/v2/status.json',
           'Atlassian Status|https://status.atlassian.com/api/v2/status.json',
           'npm Status|https://status.npmjs.org/api/v2/status.json',
           'DigitalOcean Status|https://status.digitalocean.com/api/v2/status.json',
           'Render Status|https://status.render.com/api/v2/status.json',
           'Zoom Status|https://status.zoom.us/api/v2/status.json')


def update(path):
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_mode & 0o077:
        raise ValueError('Configuration must be a regular private file (mode 600)')
    config = json.loads(path.read_text())
    rcp = config['rcp']
    limits = rcp['monitors']
    if limits.get('max-per-owner') not in (3, 5) or limits.get('max-total') not in (8, 30) or limits.get('min-interval-seconds') != 60 or limits.get('max-timeout-ms') != 5000:
        raise ValueError('Expected the reviewed demo limits: owner 3 or 5, total 8 or 30, interval 60, timeout 5000')
    entries = [entry.strip() for entry in rcp['demo']['monitors'].split(',') if entry.strip()]
    urls = {entry.partition('|')[2] for entry in entries}
    for target in TARGETS:
        if target.partition('|')[2] not in urls:
            entries.append(target)
    demo = rcp['demo']
    if demo.get('max-monitors', 15) != 15:
        raise ValueError('Expected the reviewed separate demo ceiling of 15')
    if len(entries) > 15:
        raise ValueError('Configured demo targets would exceed the separate hard ceiling of 15; review existing targets')
    limits['max-per-owner'] = 5
    limits['max-total'] = 30
    rcp['demo']['monitors'] = ', '.join(entries)
    rcp['demo']['max-monitors'] = 15
    fd, temporary = tempfile.mkstemp(prefix='.variety-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(json.dumps(config, indent=2) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o600)
            os.fchown(stream.fileno(), metadata.st_uid, metadata.st_gid)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('configuration', type=Path)
    args = parser.parse_args()
    try:
        update(args.configuration)
    except (OSError, ValueError, KeyError):
        parser.exit(1, 'Could not update configuration. Check private permissions, limits and target count. No configuration values were printed.\n')
    print('Updated visitor quotas (5 per owner, 30 total), exempt demo targets and their separate ceiling of 15. Recreate the backend container to load the configuration.')
