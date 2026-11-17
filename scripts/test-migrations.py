#!/usr/bin/env python3
"""Exercise migration runner against a disposable PostgreSQL cluster."""
import os, pathlib, shutil, socket, subprocess, sys, tempfile

pg = pathlib.Path('/usr/lib/postgresql/16/bin')
runner = pathlib.Path(__file__).with_name('apply-migrations.py')
with tempfile.TemporaryDirectory(prefix='ops-migration-test-') as directory:
    d = pathlib.Path(directory)
    work = d / 'project'; (work/'scripts').mkdir(parents=True); (work/'migrations').mkdir()
    shutil.copy2(runner,work/'scripts/apply-migrations.py')
    with socket.socket() as s:
        s.bind(('127.0.0.1',0)); port=s.getsockname()[1]
    env={**os.environ,'PGHOST':'127.0.0.1','PGPORT':str(port),'PGUSER':os.environ['USER'],'PGDATABASE':'postgres'}
    def call(args, ok=True, input=None):
        p=subprocess.run(list(map(str,args)),input=input,text=True,capture_output=True,env=env)
        if (p.returncode==0)!=ok: raise RuntimeError('unexpected result: '+p.stdout+p.stderr)
        return p.stdout.strip()
    call([pg/'initdb','-D',d/'data','--auth=trust','--no-instructions'])
    call([pg/'pg_ctl','-D',d/'data','-l',d/'postgres.log','-o',f'-h 127.0.0.1 -k {d} -p {port}','start'])
    try:
        cmd=[sys.executable,work/'scripts/apply-migrations.py',pg/'psql','-X','-qAt','-v','ON_ERROR_STOP=1']
        sql=[pg/'psql','-X','-qAt','-v','ON_ERROR_STOP=1']
        first=work/'migrations/20261116000001_create.sql'
        first.write_text('CREATE TABLE public.fixture (id integer PRIMARY KEY);\n')
        call(cmd); call(cmd)
        assert call(sql,input='SELECT count(*) FROM admiral_deploy.migrations;')=='1'
        print('PASS migration and repeat')
        first.write_text('CREATE TABLE public.altered (id integer);\n')
        call(cmd,ok=False)
        assert call(sql,input="SELECT to_regclass('public.altered') IS NULL;")=='t'
        print('PASS changed historical migration rejected')
        first.write_text('CREATE TABLE public.fixture (id integer PRIMARY KEY);\n')
        second=work/'migrations/20261116000002_error.sql'
        second.write_text('CREATE TABLE public.transient_test (id integer);\nSELECT missing_column FROM public.fixture;\n')
        call(cmd,ok=False)
        assert call(sql,input="SELECT to_regclass('public.transient_test') IS NULL;")=='t'
        assert call(sql,input='SELECT count(*) FROM admiral_deploy.migrations;')=='1'
        print('PASS failed migration transaction rollback')
        second.write_text('ALTER TABLE public.fixture ADD COLUMN note text;\n')
        call(cmd)
        assert call(sql,input='SELECT count(*) FROM admiral_deploy.migrations;')=='2'
        print('PASS subsequent migration')
        second.unlink()
        call(cmd,ok=False)
        assert call(sql,input='SELECT count(*) FROM admiral_deploy.migrations;')=='2'
        print('PASS missing applied migration rejected')
        second.write_text('ALTER TABLE public.fixture ADD COLUMN note text;\n')
        third=work/'migrations/20261116000003_function.sql'
        third.write_text("CREATE FUNCTION public.fixture_function() RETURNS integer LANGUAGE plpgsql AS $body$\nBEGIN\n RETURN 42;\nEND\n$body$;\n")
        call(cmd)
        assert call(sql,input='SELECT public.fixture_function();')=='42'
        print('PASS PL/pgSQL function migration with BEGIN and END')
        fourth=work/'migrations/20261116000004_break.sql'
        for body in ['SELECT 1; COMMIT;','/* comment */ END;','SELECT 1;\\q','ROLLBACK;','START TRANSACTION;','COPY fixture TO PROGRAM \'true\';']:
            fourth.write_text(body)
            call(cmd,ok=False)
        assert call(sql,input='SELECT count(*) FROM admiral_deploy.migrations;')=='3'
        print('PASS transaction escapes and psql commands rejected')
    finally:
        call([pg/'pg_ctl','-D',d/'data','-m','fast','stop'])
