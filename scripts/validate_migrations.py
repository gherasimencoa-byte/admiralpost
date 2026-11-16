#!/usr/bin/env python3
"""Static validation of AdmiralPost SQL migration files. Never connects to a DB."""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "db" / "migrations"
OUTPUT = ROOT / "dist" / "admiralpost-db-migrations.json"
FILENAME = re.compile(r"^\d{14}_[a-z][a-z0-9_]*\.sql$")
MAX_FILE_BYTES = 1024 * 1024
MAX_TOTAL_BYTES = 8 * 1024 * 1024

def main() -> None:
    if not MIGRATIONS.is_dir():
        raise ValueError("db/migrations directory is missing")
    entries = []
    seen_names = set()
    total = 0
    for path in sorted(MIGRATIONS.iterdir()):
        if path.name == "README.md":
            continue
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"Unexpected item in migration folder: {path.name}")
        if not FILENAME.fullmatch(path.name):
            raise ValueError(f"Invalid migration filename: {path.name}")
        if path.name in seen_names:
            raise ValueError(f"Duplicate migration: {path.name}")
        seen_names.add(path.name)
        data = path.read_bytes()
        if not data or len(data) > MAX_FILE_BYTES or b"\x00" in data:
            raise ValueError(f"Invalid SQL file size/content: {path.name}")
        total += len(data)
        if total > MAX_TOTAL_BYTES:
            raise ValueError("Total SQL migrations exceed size limit")
        sql = data.decode("utf-8")
        if sql.startswith("\ufeff"):
            raise ValueError(f"Remove UTF-8 BOM: {path.name}")
        # SQL runs via psql -f under a restricted DB role; shell/meta commands
        # are not allowed in migration files. This is not a security sandbox.
        if any(line.lstrip().startswith("\\") for line in sql.splitlines()):
            raise ValueError(f"psql meta-commands are prohibited: {path.name}")
        entries.append({
            "filename": path.name,
            "sha256": hashlib.sha256(data).hexdigest(),
            "size": len(data),
        })
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps({
        "format": 1,
        "migrations": entries,
    }, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(f"Validated {len(entries)} AdmiralPost migration files")
    print(f"Manifest: {OUTPUT.relative_to(ROOT)}")

if __name__ == "__main__":
    try:
        main()
    except (ValueError, UnicodeError, OSError) as exc:
        print(f"Migration validation FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
