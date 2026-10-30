-- =====================================================================
-- Parallello — 005: login do Parallello e liberação de módulos
--
-- Rode DEPOIS do 004, no SQL Editor (pode rodar mais de uma vez).
--
-- O Supabase que era do Gerar Pré-Venda passa a ser o do Parallello:
-- empresas, usuários, licença/cobrança e conexões valem para todos os
-- sistemas. O que muda:
--
--   * perfis.usuario: nome de login (ex.: "joao"). O e-mail interno da
--     nuvem é montado pelo programa: joao@parallello.app (ninguém precisa
--     de e-mail real). Contas antigas com e-mail continuam entrando pelo e-mail.
--   * perfis.modulos: módulos liberados para o usuário. Começa vazio:
--     o administrador libera em "Liberar módulos".
--   * empresas.modulos: módulos contratados pela empresa (null = todos).
--     O administrador da empresa só consegue liberar o que foi contratado.
--   * definir_modulos / definir_modulos_empresa: as únicas formas de
--     mudar os módulos (ficam registradas nos eventos do sistema).
--   * perfis.modulos_visiveis: os módulos que o PRÓPRIO usuário escolheu ver na
--     tela inicial ("Liberar módulos"). Só valem os que ele tem permissão:
--       - super administrador: todos
--       - administrador da empresa: os contratados pela empresa
--       - operador: os que o administrador permitiu (perfis.modulos), dentro do contrato
-- =====================================================================

-- ---------------------------------------------------------------- colunas
alter table public.perfis add column if not exists usuario text;
alter table public.perfis add column if not exists modulos text[] not null default '{}';
alter table public.perfis add column if not exists modulos_visiveis text[] not null default '{}';
create unique index if not exists perfis_usuario_unico on public.perfis (lower(usuario)) where usuario is not null;

alter table public.empresas add column if not exists modulos text[];  -- null = todos os módulos

-- Contas criadas com o e-mail interno ganham o nome de login (ex.: joao@parallello.app -> joao)
update public.perfis
set usuario = split_part(email, '@', 1)
where usuario is null and lower(email) like '%@parallello.app';

-- ---------------------------------------------------------------- perfil criado junto com o usuário
-- Igual ao 002, agora com o nome de login e os módulos iniciais (app_metadata,
-- que só a Edge Function consegue definir).
create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_modulos text[] := '{}';
begin
  if jsonb_typeof(new.raw_app_meta_data -> 'modulos') = 'array' then
    select coalesce(array_agg(x), '{}') into v_modulos from jsonb_array_elements_text(new.raw_app_meta_data -> 'modulos') as x;
  end if;
  insert into public.perfis (id, nome, email, empresa_id, papel, usuario, modulos)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    nullif(new.raw_app_meta_data ->> 'empresa_id', '')::uuid,
    case when new.raw_app_meta_data ->> 'papel' in ('admin', 'operador') then new.raw_app_meta_data ->> 'papel' else 'operador' end,
    nullif(lower(new.raw_app_meta_data ->> 'usuario'), ''),
    v_modulos
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------- liberar módulos
-- Administrador da empresa: libera para os usuários da própria empresa (inclusive ele mesmo),
-- só entre os módulos contratados. Super administrador: qualquer usuário, qualquer módulo.
create or replace function public.definir_modulos(p_usuario uuid, p_modulos text[])
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  v_alvo public.perfis;
  v_contratados text[];
  v_final text[];
begin
  select * into v_alvo from public.perfis where id = p_usuario;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  if not (public.eh_super()
          or (public.eh_admin() and v_alvo.empresa_id = public.minha_empresa() and v_alvo.papel <> 'super_admin')) then
    raise exception 'Apenas o administrador da empresa libera módulos.';
  end if;
  select coalesce(array_agg(distinct m order by m), '{}') into v_final
  from unnest(coalesce(p_modulos, '{}')) as m where m <> '';
  if not public.eh_super() then
    select e.modulos into v_contratados from public.empresas e where e.id = v_alvo.empresa_id;
    if v_contratados is not null then
      select coalesce(array_agg(m order by m), '{}') into v_final from unnest(v_final) as m where m = any (v_contratados);
    end if;
  end if;
  if v_final is distinct from v_alvo.modulos then
    update public.perfis set modulos = v_final where id = p_usuario;
    insert into public.eventos_sistema (empresa_id, acao, entidade, descricao, detalhes)
    values (v_alvo.empresa_id, 'liberou', 'módulos',
      format('Módulos de %s: %s', coalesce(v_alvo.usuario, v_alvo.email), case when cardinality(v_final) = 0 then 'nenhum' else array_to_string(v_final, ', ') end),
      jsonb_build_object('antes', to_jsonb(v_alvo.modulos), 'depois', to_jsonb(v_final)));
  end if;
  return v_final;
end $$;
revoke execute on function public.definir_modulos(uuid, text[]) from public, anon;
grant execute on function public.definir_modulos(uuid, text[]) to authenticated;

-- Módulos contratados pela empresa (só o super administrador). null = todos.
create or replace function public.definir_modulos_empresa(p_empresa uuid, p_modulos text[])
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  v_nome text;
  v_final text[];
begin
  if not public.eh_super() then raise exception 'Apenas o super administrador.'; end if;
  select nome into v_nome from public.empresas where id = p_empresa;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  if p_modulos is not null then
    select coalesce(array_agg(distinct m order by m), '{}') into v_final from unnest(p_modulos) as m where m <> '';
  end if;
  update public.empresas set modulos = v_final where id = p_empresa;
  insert into public.eventos_sistema (empresa_id, acao, entidade, descricao)
  values (p_empresa, 'editou', 'módulos contratados',
    format('Empresa %s: %s', v_nome, case when v_final is null then 'todos os módulos' when cardinality(v_final) = 0 then 'nenhum módulo' else array_to_string(v_final, ', ') end));
  return v_final;
end $$;
revoke execute on function public.definir_modulos_empresa(uuid, text[]) from public, anon;
grant execute on function public.definir_modulos_empresa(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------- módulos que o próprio usuário escolhe ver
-- Devolve só os que ele pode usar (os outros são ignorados).
create or replace function public.modulos_permitidos(p_usuario uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select case
    when p.papel = 'super_admin' then null  -- null = todos
    when p.papel = 'admin' then e.modulos   -- os contratados (null = todos)
    else (select coalesce(array_agg(m order by m), '{}') from unnest(p.modulos) as m where e.modulos is null or m = any (e.modulos))
  end
  from public.perfis p left join public.empresas e on e.id = p.empresa_id
  where p.id = p_usuario;
$$;
revoke execute on function public.modulos_permitidos(uuid) from public, anon;
grant execute on function public.modulos_permitidos(uuid) to authenticated;

create or replace function public.definir_meus_modulos(p_modulos text[])
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  v_permitidos text[];
  v_final text[];
begin
  if not public.usuario_liberado() then raise exception 'Acesso bloqueado.'; end if;
  v_permitidos := public.modulos_permitidos(auth.uid());
  select coalesce(array_agg(distinct m order by m), '{}') into v_final
  from unnest(coalesce(p_modulos, '{}')) as m
  where m <> '' and (v_permitidos is null or m = any (v_permitidos));
  update public.perfis set modulos_visiveis = v_final where id = auth.uid();
  return v_final;
end $$;
revoke execute on function public.definir_meus_modulos(text[]) from public, anon;
grant execute on function public.definir_meus_modulos(text[]) to authenticated;

-- ---------------------------------------------------------------- permissões de coluna
-- usuario, modulos e modulos_visiveis não são alterados direto pelo programa (só pela Edge Function e pelas funções acima).
revoke update on public.perfis from anon, authenticated;
grant update (nome, papel, ativo, empresa_id) on public.perfis to authenticated;
-- empresas.modulos: só o super administrador altera empresas (RLS do 002); use definir_modulos_empresa.
