-- Corrige valores jsonb gravados como string JSON (dupla serialização do driver postgres.js).
-- Tudo num único bloco, sem funções temporárias, para rodar em qualquer executor de migração.
do $$
declare
  c record;
  r record;
  v jsonb;
  e jsonb;
  acc jsonb;
  i int;
begin
  for c in
    select table_name t, column_name col from information_schema.columns
    where table_schema = current_schema() and data_type = 'jsonb'
  loop
    for r in execute format(
      'select ctid as rid, %I as v from %I where jsonb_typeof(%I) = ''string'' or (%L = ''attribution'' and jsonb_typeof(%I) = ''array'')',
      c.col, c.t, c.col, c.col, c.col)
    loop
      v := r.v;
      if jsonb_typeof(v) = 'array' then
        -- "attribution || $n::jsonb" com strings virou um array de strings JSON: junta num objeto.
        acc := '{}'::jsonb;
        for e in select x from jsonb_array_elements(v) x loop
          i := 0;
          while e is not null and jsonb_typeof(e) = 'string' and i < 5 loop
            begin
              e := (e #>> '{}')::jsonb;
            exception when others then
              e := null;
            end;
            i := i + 1;
          end loop;
          if e is not null and jsonb_typeof(e) = 'object' then acc := acc || e; end if;
        end loop;
        v := acc;
      else
        i := 0;
        while v is not null and jsonb_typeof(v) = 'string' and i < 5 loop
          begin
            v := (v #>> '{}')::jsonb;
          exception when others then
            v := null;
          end;
          i := i + 1;
        end loop;
        if v is null then
          v := case when c.col = 'ranked_career_ids' then '[]'::jsonb else '{}'::jsonb end;
        end if;
      end if;
      execute format('update %I set %I = $1 where ctid = $2', c.t, c.col) using v, r.rid;
    end loop;
  end loop;
end $$;

-- O "espalhamento" da string criou chaves numéricas ("0", "1", ...) em respostas, contexto e atribuição.
update quiz_sessions
set answers = answers - array(select k from jsonb_object_keys(answers) k where k !~ '^Q[0-9]+$')
where jsonb_typeof(answers) = 'object' and exists (select 1 from jsonb_object_keys(answers) k where k !~ '^Q[0-9]+$');

update quiz_sessions
set context = context - array(select k from jsonb_object_keys(context) k where k not in ('moment', 'dailyTime', 'currentArea'))
where jsonb_typeof(context) = 'object' and exists (select 1 from jsonb_object_keys(context) k where k not in ('moment', 'dailyTime', 'currentArea'));

update quiz_sessions
set attribution = attribution - array(select k from jsonb_object_keys(attribution) k where k ~ '^[0-9]+$')
where jsonb_typeof(attribution) = 'object' and exists (select 1 from jsonb_object_keys(attribution) k where k ~ '^[0-9]+$');
