-- Corrige valores jsonb gravados como string JSON (dupla serialização do driver postgres.js).
create or replace function pg_temp.mc_unwrap(v jsonb) returns jsonb language plpgsql as $$
declare i int := 0;
begin
  while v is not null and jsonb_typeof(v) = 'string' and i < 5 loop
    begin
      v := (v #>> '{}')::jsonb;
    exception when others then
      return null;
    end;
    i := i + 1;
  end loop;
  return v;
end $$;

do $$
declare r record;
begin
  for r in
    select table_name, column_name from information_schema.columns
    where table_schema = current_schema() and data_type = 'jsonb'
  loop
    execute format(
      'update %I set %I = coalesce(pg_temp.mc_unwrap(%I), %L::jsonb) where jsonb_typeof(%I) = ''string''',
      r.table_name, r.column_name, r.column_name,
      case when r.column_name = 'ranked_career_ids' then '[]' else '{}' end,
      r.column_name);
  end loop;
end $$;

-- "attribution || $n::jsonb" com strings virou um array de strings JSON: junta de volta num objeto.
create or replace function pg_temp.mc_merge(v jsonb) returns jsonb language plpgsql as $$
declare e jsonb; acc jsonb := '{}'::jsonb;
begin
  for e in select x from jsonb_array_elements(v) x loop
    e := pg_temp.mc_unwrap(e);
    if e is not null and jsonb_typeof(e) = 'array' then e := pg_temp.mc_merge(e); end if;
    if e is not null and jsonb_typeof(e) = 'object' then acc := acc || e; end if;
  end loop;
  return acc;
end $$;

do $$
declare r record;
begin
  for r in
    select table_name from information_schema.columns
    where table_schema = current_schema() and data_type = 'jsonb' and column_name = 'attribution'
  loop
    execute format('update %I set attribution = pg_temp.mc_merge(attribution) where jsonb_typeof(attribution) = ''array''', r.table_name);
  end loop;
end $$;

-- O "espalhamento" da string criou chaves numéricas ("0", "1", ...) em respostas e contexto.
update quiz_sessions
set answers = answers - array(select k from jsonb_object_keys(answers) k where k !~ '^Q[0-9]+$')
where jsonb_typeof(answers) = 'object' and exists (select 1 from jsonb_object_keys(answers) k where k !~ '^Q[0-9]+$');

update quiz_sessions
set context = context - array(select k from jsonb_object_keys(context) k where k not in ('moment', 'dailyTime', 'currentArea'))
where jsonb_typeof(context) = 'object' and exists (select 1 from jsonb_object_keys(context) k where k not in ('moment', 'dailyTime', 'currentArea'));

update quiz_sessions
set attribution = attribution - array(select k from jsonb_object_keys(attribution) k where k ~ '^[0-9]+$')
where jsonb_typeof(attribution) = 'object' and exists (select 1 from jsonb_object_keys(attribution) k where k ~ '^[0-9]+$');
