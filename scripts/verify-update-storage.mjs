// Live Storage authorization rehearsal. All fixture writes roll back; no customer data.
import { execFileSync } from 'node:child_process';
const query = `begin;
set local statement_timeout='15s';
do $qa$
declare affected integer; role_name text;
begin
  if not exists(select 1 from storage.buckets where id='mobile-updates' and public and file_size_limit=67108864) then
    raise exception 'Release bucket configuration mismatch';
  end if;
  insert into storage.objects(bucket_id,name) values('mobile-updates','qa-only/policy-transaction-probe');
  foreach role_name in array array['anon','authenticated'] loop
    execute 'set local role ' || quote_ident(role_name);
    begin
      insert into storage.objects(bucket_id,name) values('mobile-updates','qa-only/forbidden-insert');
      raise exception 'SECURITY FAILURE: client could insert an update';
    exception when insufficient_privilege then null;
    end;
    update storage.objects set name='qa-only/forbidden-update' where bucket_id='mobile-updates' and name='qa-only/policy-transaction-probe';
    get diagnostics affected=row_count;
    if affected<>0 then raise exception 'SECURITY FAILURE: client could update'; end if;
    begin
      delete from storage.objects where bucket_id='mobile-updates' and name='qa-only/policy-transaction-probe';
      get diagnostics affected=row_count;
      if affected<>0 then raise exception 'SECURITY FAILURE: client could delete'; end if;
    exception when insufficient_privilege then null; -- Storage may deny SQL deletes before RLS.
    end;
    execute 'reset role';
  end loop;
end $qa$;
rollback;
select 'PASS: anon and authenticated cannot insert/update/delete release artifacts. All probe rows rolled back.' result;`;
process.stdout.write(execFileSync('npx',['--yes','supabase@2.121.0','db','query','--linked',query],{
  cwd:process.env.COZY_BACKEND_ROOT || '/Users/imbatzy/Downloads/Cozyyyyyyy',encoding:'utf8',maxBuffer:1024*1024
}));
