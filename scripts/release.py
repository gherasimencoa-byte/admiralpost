#!/usr/bin/env python3
import hashlib
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]

EXCLUDED = {
    ".github", "scripts", "tests", "docs",
    "dist", "reports", ".git"
}

ALLOWED = {
    ".html", ".css", ".js", ".svg",
    ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".mp4", ".pdf", ".txt", ".xml", ".json",
    ".ico", ".webmanifest", ".woff", ".woff2",
    ".ttf", ".otf", ".avif", ".webm"
}

BINARY = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".mp4", ".pdf", ".ico", ".woff", ".woff2",
    ".ttf", ".otf", ".avif", ".webm"
}

SECRET_PATTERNS = [
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    r"\bgh[pousr]_[A-Za-z0-9]{30,}\b",
    r"\bgithub_pat_[A-Za-z0-9_]{50,}\b",
    r"\bAKIA[A-Z0-9]{16}\b",
    r"(?i)(?:postgres(?:ql)?|mysql)://[^\s/:]+:[^\s@]+@",
]

def git_output(*args):
    return subprocess.check_output(
        ["git", *args], cwd=ROOT
    ).decode().strip()

def main():
    names = [
        n.decode()
        for n in subprocess.check_output(
            ["git", "ls-files", "-z"], cwd=ROOT
        ).split(b"\0") if n
    ]

    names = sorted(
        n for n in names
        if not (set(PurePosixPath(n).parts) & EXCLUDED)
        and n != ".gitignore"
    )

    if not names or "index.html" not in names or "VERSION" not in names:
        raise ValueError("Required website files are missing")

    version = (ROOT / "VERSION").read_text().strip()

    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?", version):
        raise ValueError("Invalid VERSION")

    total_size = 0

    for name in names:
        parts = PurePosixPath(name).parts
        path = ROOT / name

        if name.startswith("/") or "\\" in name or ".." in parts:
            raise ValueError("Unsafe path: " + name)

        if ".well-known" in parts:
            raise ValueError("ACME files must not be included")

        if any(x.lower() in {
            "private", "secrets", "backups",
            "uploads", "runtime", "pgdata"
        } for x in parts):
            raise ValueError("Private/runtime path: " + name)

        if path.is_symlink() or not path.is_file():
            raise ValueError("Missing file or symlink: " + name)

        if name != "VERSION" and path.suffix.lower() not in ALLOWED:
            raise ValueError("Unexpected file type: " + name)

        size = path.stat().st_size
        total_size += size

        if total_size > 200 * 1024 * 1024:
            raise ValueError("Website package exceeds 200 MB")

        if path.suffix.lower() not in BINARY:
            content = path.read_text(encoding="utf-8")
            for pattern in SECRET_PATTERNS:
                if re.search(pattern, content):
                    raise ValueError("Possible embedded secret: " + name)

    commit = git_output("rev-parse", "HEAD")

    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise ValueError("Invalid Git commit")

    files = {
        name: (ROOT / name).read_bytes()
        for name in names
    }

    hashes = {
        name: hashlib.sha256(data).hexdigest()
        for name, data in files.items()
    }

    payload_hash = hashlib.sha256(
        json.dumps(hashes, sort_keys=True).encode()
    ).hexdigest()

    manifest = {
        "version": version,
        "source_commit": commit,
        "payload_sha256": payload_hash,
        "files": hashes
    }

    manifest_data = (
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    ).encode()

    output = ROOT / "dist"
    output.mkdir(exist_ok=True)

    for old in output.glob("AdmiralPost-*.zip*"):
        old.unlink()

    archive_path = output / f"AdmiralPost-{version}.zip"

    with zipfile.ZipFile(
        archive_path, "w",
        zipfile.ZIP_DEFLATED,
        compresslevel=9
    ) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(
                name, (2020, 1, 1, 0, 0, 0)
            )
            info.create_system = 3
            info.external_attr = 0o100644 << 16

            archive.writestr(
                info, data,
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=9
            )

        info = zipfile.ZipInfo(
            "manifest.json", (2020, 1, 1, 0, 0, 0)
        )
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        archive.writestr(info, manifest_data)

    with zipfile.ZipFile(archive_path) as archive:
        if archive.testzip() is not None:
            raise ValueError("ZIP integrity check failed")

    checksum = hashlib.sha256(
        archive_path.read_bytes()
    ).hexdigest()

    checksum_path = Path(str(archive_path) + ".sha256")
    checksum_path.write_text(
        f"{checksum}  {archive_path.name}\n"
    )

    print("RELEASE CREATED SUCCESSFULLY")
    print("VERSION:", version)
    print("GITHUB COMMIT:", commit)
    print("FILES CHECKED:", len(names))
    print("ZIP SIZE:", archive_path.stat().st_size)
    print("SHA256:", checksum)
    print("PACKAGE:", archive_path)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("BUILD FAILED:", exc, file=sys.stderr)
        sys.exit(1)
