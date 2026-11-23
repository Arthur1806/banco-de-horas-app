-- Aplicado no projeto Supabase "banco-de-horas" (kmcjdzirxwnowokxlcqx) em 23/11/2026.
-- Dados de cada usuário do Banco de Horas (um documento JSON por conta).
create table public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint user_data_size check (octet_length(data::text) <= 2000000)
);

alter table public.user_data enable row level security;

-- Somente usuários logados, e cada um só enxerga/altera a própria linha.
revoke all on public.user_data from anon;
grant select, insert, update, delete on public.user_data to authenticated;

create policy "user_data: ler os próprios dados" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_data: criar os próprios dados" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_data: atualizar os próprios dados" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_data: apagar os próprios dados" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Salva com controle de versão: se outro aparelho salvou antes (versão diferente),
-- devolve erro 'conflict' para o app perguntar qual versão manter. p_force ignora a checagem.
create or replace function public.save_user_data(p_data jsonb, p_base_version bigint, p_force boolean default false)
returns table (version bigint, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cur bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select d.version into v_cur from public.user_data d where d.user_id = v_uid for update;
  if v_cur is null then
    insert into public.user_data (user_id, data, version, updated_at) values (v_uid, p_data, 1, now());
    return query select 1::bigint, now();
  elsif not p_force and p_base_version is distinct from v_cur then
    raise exception 'conflict' using errcode = '40001';
  else
    update public.user_data d set data = p_data, version = v_cur + 1, updated_at = now() where d.user_id = v_uid;
    return query select v_cur + 1, now();
  end if;
end;
$$;

revoke execute on function public.save_user_data(jsonb, bigint, boolean) from public, anon;
grant execute on function public.save_user_data(jsonb, bigint, boolean) to authenticated;
