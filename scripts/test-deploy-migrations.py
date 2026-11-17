#!/usr/bin/env python3
"""Exercise the existing shell deployer in temporary paths with real PostgreSQL."""
import hashlib,json,os,pathlib,shutil,socket,subprocess,sys,tempfile,zipfile
S=pathlib.Path(__file__).resolve().parent
PG=pathlib.Path('/usr/lib/postgresql/16/bin')
with tempfile.TemporaryDirectory(prefix='admiral-deploy-test-') as tmp:
    d=pathlib.Path(tmp);base=d/'base';incoming=d/'incoming';backups=d/'backups';bin=d/'bin'
    for p in (base/'releases/old',base/'scripts',incoming,backups,bin):p.mkdir(parents=True,exist_ok=True)
    (base/'releases/old/index.html').write_text('old');(base/'current').symlink_to(base/'releases/old')
    shutil.copy2(S/'apply-migrations.py',base/'scripts/apply-migrations.py')
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env={**os.environ,'PATH':str(bin)+':'+os.environ['PATH'],'PGHOST':'127.0.0.1','PGPORT':str(port),'PGUSER':os.environ['USER'],'PGDATABASE':'postgres'}
    def call(args,ok=True,input=None):
        r=subprocess.run(list(map(str,args)),input=input,text=True,capture_output=True,env=env)
        if (r.returncode==0)!=ok:raise RuntimeError(r.stdout+r.stderr)
        return r.stdout.strip()
    def stub(name,body):
        p=bin/name;p.write_text('#!/usr/bin/env python3\n'+body);p.chmod(0o755)
    log=d/'backup.log';log.write_text('=== BACKUP START\nREMOTE SHA256 VERIFICATION: OK\nBACKUP SUCCESS\n')
    stub('systemctl',f"import pathlib,sys\nif pathlib.Path({str(d/'fail-backup')!r}).exists():sys.exit(1)\nif sys.argv[1]=='show':print('success')\n")
    stub('docker',f"import os,sys\nos.execv({str(PG/'psql')!r},['psql','-X','-qAt','-v','ON_ERROR_STOP=1'])\n")
    stub('curl',f"import pathlib,sys\np=pathlib.Path(sys.argv[sys.argv.index('-o')+1]);p.write_bytes((pathlib.Path({str(base/'current')!r})/'index.html').read_bytes());print('503' if pathlib.Path({str(d/'fail-health')!r}).exists() else '200',end='')\n")
    # Test-only removal of root ownership requirements; production script retains them.
    sh=(S/'admiralpost-deploy').read_text().replace('[[ $EUID -eq 0 ]] || die "Must run as root"',':')
    sh=sh.replace('/srv/admiralpost',str(base)).replace('/var/lib/admiralpost-deploy/incoming',str(incoming)).replace('/var/backups/admiralpost-deploy',str(backups)).replace('/run/lock/admiralpost-deploy.lock',str(d/'site.lock')).replace('/run/lock/alilpost-ops-deploy.lock',str(d/'shared.lock')).replace('/var/log/alilpost-backup.log',str(log)).replace('/var/tmp/admiralpost-deploy.XXXXXX',str(d/'private.XXXXXX')).replace('chown -R root:root "$STAGE"',':').replace('flock -w 600 8','flock -w 1 8')
    script=d/'deploy';script.write_text(sh)
    call(['bash','-n',script])
    def package(n,migrations):
        files={'index.html':('site'+str(n)).encode(),'VERSION':b'1.0.1',**{k:v.encode() for k,v in migrations.items()}}
        hashes={k:hashlib.sha256(v).hexdigest() for k,v in files.items()}
        manifest={'version':'1.0.1','source_commit':f'{n:040x}','files':hashes,'payload_sha256':hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest()}
        # Commit prefix must differ so releases do not collide.
        manifest['source_commit']=f'{n:012x}'+'0'*28
        z=incoming/'release.zip'
        with zipfile.ZipFile(z,'w') as archive:
            for k,v in files.items():archive.writestr(k,v)
            archive.writestr('manifest.json',json.dumps(manifest))
        (incoming/'release.sha256').write_text(hashlib.sha256(z.read_bytes()).hexdigest()+'  release.zip\n')
    def sql(q):return call([PG/'psql','-X','-qAt','-v','ON_ERROR_STOP=1'],input=q)
    call([PG/'initdb','-D',d/'pg','--auth=trust','--no-instructions'])
    call([PG/'pg_ctl','-D',d/'pg','-l',d/'pg.log','-o',f'-h 127.0.0.1 -k {d} -p {port}','start'])
    try:
        package(1,{});call(['bash',script]);assert (base/'current/index.html').read_text()=='site1'
        print('PASS existing website-only release')
        migration={'migrations/20261117000001_fixture.sql':'CREATE TABLE deploy_fixture(id int); INSERT INTO deploy_fixture VALUES(1);'}
        package(2,migration);call(['bash',script]);assert sql('SELECT count(*) FROM deploy_fixture;')=='1'
        assert not (base/'current/migrations').exists()
        print('PASS SQL applied before publication and never installed publicly')
        package(3,migration);call(['bash',script]);assert sql('SELECT count(*) FROM deploy_fixture;')=='1'
        print('PASS next release does not repeat migration')
        previous=(base/'current').resolve()
        package(4,{**migration,'migrations/20261117000002_bad.sql':'CREATE TABLE rolled_back(id int); SELECT missing FROM deploy_fixture;'});call(['bash',script],ok=False)
        assert (base/'current').resolve()==previous and sql("SELECT to_regclass('rolled_back') IS NULL;")=='t'
        print('PASS failed SQL rolls back and preserves website')
        (d/'fail-backup').touch();package(5,migration);call(['bash',script],ok=False);(d/'fail-backup').unlink()
        assert (base/'current').resolve()==previous
        print('PASS failed backup prevents publication')
        package(6,{});call(['bash',script],ok=False);assert (base/'current').resolve()==previous
        print('PASS missing migration history prevents publication')
        (d/'fail-health').touch();package(7,{**migration,'migrations/20261117000002_good.sql':'ALTER TABLE deploy_fixture ADD COLUMN note text;'})
        output=call(['bash',script],ok=False);(d/'fail-health').unlink()
        assert (base/'current').resolve()==previous and 'NOT automatically restored' in output
        assert sql("SELECT count(*) FROM information_schema.columns WHERE table_name='deploy_fixture' AND column_name='note';")=='1'
        print('PASS unhealthy website rolls back files while committed SQL is retained')
        import fcntl
        with (d/'shared.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            package(8,migration);call(['bash',script],ok=False)
            assert (incoming/'release.zip').exists()
        print('PASS shared Ops lock prevents concurrent deployment')
    finally:call([PG/'pg_ctl','-D',d/'pg','-m','fast','stop'])
