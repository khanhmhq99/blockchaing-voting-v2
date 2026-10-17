"""Stream a MACI tar.gz archive and report member hashes without extraction."""

import hashlib
import json
import sys
import tarfile
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python inventory-archive.py <archive.tar.gz>")
    archive = Path(sys.argv[1])
    with tarfile.open(archive, "r|gz") as entries:
        for member in entries:
            if not member.isfile():
                continue
            source = entries.extractfile(member)
            if source is None:
                raise ValueError(f"Cannot read member: {member.name}")
            digest = hashlib.sha256()
            size = 0
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
                size += len(chunk)
            if size != member.size:
                raise ValueError(f"Size mismatch: {member.name}")
            print(json.dumps({"path": member.name, "size": size, "sha256": digest.hexdigest(), "trust": "UNVERIFIED"}))


if __name__ == "__main__":
    main()
