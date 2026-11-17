#!/usr/bin/env python3
"""Apply new Ops migrations atomically. Requires a caller-supplied psql connection.

Each migration must be transactional SQL; do not use transaction control or
psql meta-commands in migration files. Existing databases start with an empty
ledger: legacy SQL is documented separately and must never be replayed.
"""
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parent.parent / 'migrations'
files = sorted(root.glob('*.sql'))
def validate_sql(text):
    """Reject transaction control outside strings/functions, not PL/pgSQL BEGIN.

    This catches accidental transaction breaks; reviewed migration authors are
    trusted database administrators, not an untrusted SQL sandbox.
    """
    tokens=[];i=0
    while i<len(text):
        if text.startswith('--',i):
            end=text.find('\n',i);i=len(text) if end<0 else end+1;continue
        if text.startswith('/*',i):
            depth=1;i+=2
            while i<len(text) and depth:
                if text.startswith('/*',i): depth+=1;i+=2
                elif text.startswith('*/',i): depth-=1;i+=2
                else: i+=1
            if depth: raise ValueError('Unterminated SQL comment')
            continue
        ch=text[i]
        if ch in "'\"":
            quote=ch;i+=1
            while i<len(text):
                if text[i]=='\\' and quote=="'": i+=2
                elif text[i]==quote:
                    if i+1<len(text) and text[i+1]==quote: i+=2
                    else: i+=1;break
                else: i+=1
            else: raise ValueError('Unterminated SQL quote')
            tokens.append('LITERAL');continue
        if ch=='$':
            tag=re.match(r'\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$',text[i:])
            if tag:
                end=text.find(tag[0],i+len(tag[0]))
                if end<0: raise ValueError('Unterminated dollar quote')
                i=end+len(tag[0]);tokens.append('LITERAL');continue
        if ch=='\\': raise ValueError('psql commands are not allowed')
        if ch==';':
            check_statement(tokens);tokens=[];i+=1;continue
        word=re.match(r'[A-Za-z_][A-Za-z0-9_]*',text[i:])
        if word: tokens.append(word[0].upper());i+=len(word[0])
        else: i+=1
    check_statement(tokens)

def check_statement(tokens):
    if not tokens: return
    if tokens[0] in {'BEGIN','COMMIT','ROLLBACK','ABORT','END','START','VACUUM','DISCARD','COPY'} or tokens[:2] in [['PREPARE','TRANSACTION'],['CREATE','DATABASE'],['DROP','DATABASE'],['ALTER','SYSTEM'],['SET','TRANSACTION']]:
        raise ValueError('Transaction control or unsupported SQL statement')

for f in files:
    if not re.fullmatch(r'\d{14}_[a-z0-9_]+\.sql', f.name):
        raise SystemExit('Invalid migration filename: ' + f.name)
    text = f.read_text(encoding='utf-8')
    try: validate_sql(text)
    except ValueError as error: raise SystemExit(f'{f.name}: {error}')

# psql receives the SQL and migration names via stdin, not the command line.
# Advisory lock and the ledger check live in the same transaction as all DDL.
sql = ["BEGIN;", "SET LOCAL lock_timeout='5s';", "SET LOCAL statement_timeout='180s';", "SELECT pg_advisory_xact_lock(hashtextextended('alilpost_ops_migrations',0));",
       "CREATE SCHEMA IF NOT EXISTS admiral_deploy;",
       "REVOKE ALL ON SCHEMA admiral_deploy FROM PUBLIC;",
       "CREATE TABLE IF NOT EXISTS admiral_deploy.migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());",
       "REVOKE ALL ON admiral_deploy.migrations FROM PUBLIC;"]
names = ','.join("'" + f.name + "'" for f in files)
condition = f"name NOT IN ({names})" if names else 'true'
sql.append("DO $guard$ BEGIN IF EXISTS (SELECT 1 FROM admiral_deploy.migrations WHERE " + condition +
           ") THEN RAISE EXCEPTION 'Applied migration is missing from release'; END IF; END $guard$;")
for f in files:
    body = f.read_text(encoding='utf-8')
    digest = hashlib.sha256(f.read_bytes()).hexdigest()
    name = f.name
    sql += [f"DO $guard$ BEGIN IF EXISTS (SELECT 1 FROM admiral_deploy.migrations WHERE name='{name}' AND sha256<>'{digest}') "
            "THEN RAISE EXCEPTION 'Historical migration checksum mismatch'; END IF; END $guard$;",
            f"SELECT NOT EXISTS (SELECT 1 FROM admiral_deploy.migrations WHERE name='{name}') AS apply_migration \\gset",
            "\\if :apply_migration", body,
            f"INSERT INTO admiral_deploy.migrations(name,sha256) VALUES ('{name}','{digest}');", "\\endif"]
sql.append('COMMIT;')
command = sys.argv[1:]
if not command:
    raise SystemExit('Pass a psql command, e.g. docker exec -i ... psql -X -v ON_ERROR_STOP=1 ...')
p = subprocess.run(command, input='\n'.join(sql)+'\n', text=True)
sys.exit(p.returncode)
