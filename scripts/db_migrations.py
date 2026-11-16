#!/usr/bin/env python3
"""Fail-closed, server-side AdmiralPost PostgreSQL migration runner.

This script is NOT wired into production until a server administrator has
configured two least-privileged PostgreSQL service entries, a shared deploy
lock, and a restore-tested full database backup path.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_DIR = ROOT / "db" / "migrations"
LOCK = Path("/run/lock/admiralpost-db-migrations.lock")
BACKUP_ROOT = Path("/var/backups/admiralpost-db")
JOURNAL = "admiral_integrations.schema_migrations"
NAME_RE = re.compile(r"\d{14}_[a-z][a-z0-9_]*\.sql\Z")
SHA_RE = re.compile(r"[a-f0-9]{64}\Z")
COMMIT_RE = re.compile(r"[a-f0-9]{40}\Z")

def run(argv, *, service=None, stdout=None, capture=False):
    env = os.environ.copy()
    if service:
        env["PGSERVICE"] = service
    # Never use a shell, expose a password on argv, or log connection strings.
    return subprocess.run(
        argv, env=env, check=True,
        stdout=subprocess.PIPE if capture else stdout,
        stderr=subprocess.PIPE if capture else None,
    )

def psql(query, *, service="admiralpost_migrations"):
    result = run(
        ["psql", "-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1",
         "-c", query],
        service=service, capture=True,
    )
    return result.stdout.decode().strip()

def manifest():
    records = []
    if not MIGRATION_DIR.is_dir():
        raise ValueError("Missing migration directory")
    for path in sorted(MIGRATION_DIR.iterdir()):
        if path.name == "README.md":
            continue
        if path.is_symlink() or not path.is_file() or not NAME_RE.fullmatch(path.name):
            raise ValueError(f"Unexpected migration filename or path: {path.name}")
        data = path.read_bytes()
        if not data or len(data) > 1024 * 1024 or b"\x00" in data:
            raise ValueError(f"Invalid migration contents: {path.name}")
        sql = data.decode("utf-8")
        if sql.startswith("\ufeff") or any(
            line.lstrip().startswith("\\") for line in sql.splitlines()
        ):
            raise ValueError(f"Invalid SQL formatting: {path.name}")
        # Reject transaction control and database/role-changing commands.
        # This is only a conservative review check, NOT an SQL security boundary.
        # Actual permissions must be restricted by PostgreSQL.
        prohibited = re.compile(
            r"\b(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|"
            r"ALTER\s+(?:ROLE|SYSTEM|DATABASE)|"
            r"CREATE\s+(?:ROLE|DATABASE)|"
            r"DROP\s+(?:ROLE|DATABASE))\b",
            re.IGNORECASE,
        )
        if prohibited.search(sql):
            raise ValueError(f"Migration needs manual review: {path.name}")
        records.append((path, hashlib.sha256(data).hexdigest()))
    return records

def check_target(service, expected_role):
    values = psql(
        "SELECT current_database() || '|' || current_user || '|' || "
        "current_setting('server_version_num')",
        service=service,
    ).split("|")
    if len(values) != 3 or values[0] != "postgres" or values[1] != expected_role:
        raise RuntimeError(
            f"Unexpected database/role for {service}; aborting"
        )
    if int(values[2]) < 170000 or int(values[2]) >= 180000:
        raise RuntimeError("Expected PostgreSQL 17 container; aborting")

def read_journal():
    rows = psql(
        f"SELECT filename || '|' || sha256 FROM {JOURNAL} ORDER BY filename"
    )
    result = {}
    for line in rows.splitlines():
        if not line:
            continue
        pieces = line.split("|")
        if len(pieces) != 2 or not NAME_RE.fullmatch(pieces[0]) or not SHA_RE.fullmatch(pieces[1]):
            raise RuntimeError("Corrupt migration journal; aborting")
        result[pieces[0]] = pieces[1]
    return result

def take_backup(commit):
    BACKUP_ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    if BACKUP_ROOT.is_symlink():
        raise RuntimeError("Backup directory cannot be a symlink")
    with tempfile.NamedTemporaryFile(
        prefix=f"admiralpost-pre-{commit[:12]}-",
        suffix=".dump.partial", dir=BACKUP_ROOT, delete=False
    ) as f:
        temp = Path(f.name)
        os.fchmod(f.fileno(), 0o600)
        try:
            run(["pg_dump", "-Fc", "-d", "postgres", "--no-password"],
                service="admiralpost_backup", stdout=f)
        except Exception:
            temp.unlink(missing_ok=True)
            raise
    try:
        if temp.stat().st_size < 1024:
            raise RuntimeError("Database dump seems empty")
        run(["pg_restore", "--list", str(temp)], capture=True)
        digest = hashlib.sha256()
        with temp.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                digest.update(chunk)
        final = temp.with_suffix(".dump")
        os.replace(temp, final)
        final.with_suffix(".sha256").write_text(
            digest.hexdigest() + "  " + final.name + "\n", encoding="ascii"
        )
        return final
    except Exception:
        temp.unlink(missing_ok=True)
        raise

def apply_one(path, digest, commit):
    # --single-transaction wraps migration SQL AND journal entry together.
    # The designated PostgreSQL role must own only approved AdmiralPost objects.
    query = (
        f"INSERT INTO {JOURNAL}(filename, sha256, release_commit) "
        f"VALUES ('{path.name}', '{digest}', '{commit}')"
    )
    run([
        "psql", "-X", "-w", "-v", "ON_ERROR_STOP=1", "--single-transaction",
        "-f", str(path), "-c", query,
    ], service="admiralpost_migrations")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Only validate migration source; no database access")
    parser.add_argument("--apply", action="store_true", help="Apply after verified full DB backup (server only)")
    parser.add_argument("--commit", help="Exact 40-character release commit")
    args = parser.parse_args()
    if args.check == args.apply:
        parser.error("Choose exactly one of --check or --apply")
    records = manifest()
    if args.check:
        print(f"Migration files validated: {len(records)}. No database access.")
        return
    if os.geteuid() != 0:
        raise RuntimeError("Server-side runner must be managed by administrator")
    if os.environ.get("ADMIRAL_DB_MIGRATIONS_ENABLED") != "1":
        raise RuntimeError("Production DB migrations not enabled by server administrator")
    if not args.commit or not COMMIT_RE.fullmatch(args.commit):
        raise RuntimeError("Expected exact 40-character release commit")
    for key in ("PGSERVICEFILE", "PGPASSFILE"):
        value = os.environ.get(key)
        if not value or not Path(value).is_file():
            raise RuntimeError(f"Root-owned {key} must be configured on server")
        stat = Path(value).stat()
        if stat.st_uid != 0 or stat.st_mode & 0o077:
            raise RuntimeError(f"Insecure permissions on {key}")
    LOCK.parent.mkdir(exist_ok=True, parents=True)
    with LOCK.open("a") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        # Check BOTH services point to the intended PG17 database.
        check_target("admiralpost_migrations", "admiralpost_migrator")
        check_target("admiralpost_backup", "admiralpost_backup")
        journal = read_journal()
        present = {p.name: sha for p, sha in records}
        for name, sha in journal.items():
            if present.get(name) != sha:
                raise RuntimeError(f"Applied migration changed or removed: {name}")
        pending = [(p, sha) for p, sha in records if p.name not in journal]
        if not pending:
            print("No new SQL migrations; DB unchanged.")
            return
        # Full shared PostgreSQL backup before ANY DDL.
        backup = take_backup(args.commit)
        print(f"Verified pre-migration backup: {backup}")
        for path, sha in pending:
            apply_one(path, sha, args.commit)
            print(f"Applied: {path.name}")
        print("Database migration phase completed; website must be deployed next")

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, UnicodeError, OSError, subprocess.CalledProcessError) as exc:
        print(f"DB migration phase FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
