-- ============================================================
-- 007 · MÓDULO COBRANÇA (operadores, registros de cobrança, envios)
-- Rode no SQL Editor do Supabase do Parallello, depois do 006. Pode rodar de novo.
-- Tudo é separado por empresa (empresas.id). O acesso segue o mesmo modelo das outras
-- tabelas do Parallello: usuário logado, liberado, da própria empresa e com o módulo
-- Cobrança liberado (o super administrador vê todas).
-- Não confundir com o 004_cobranca.sql, que é a cobrança da licença do Parallello.
-- ============================================================

create extension if not exists pgcrypto;

-- Se o script avulso do módulo (cobranca.sql, com empresa_id em texto e acesso aberto) já foi rodado,
-- as views e a função antigas saem aqui e as tabelas são convertidas logo abaixo.
drop view if exists public.cob_ultimo_registro_doc, public.cob_ultimo_registro_cliente,
                    public.cob_whatsapp_por_cliente, public.cob_ultimo_email_cliente;
drop function if exists public.cob_marcar_pagos(text, text[]);

-- Configuração da cobrança por empresa (financeiro, PIX, modelos, faixas, resultados)
create table if not exists public.cob_config (
  empresa_id     uuid primary key references public.empresas(id) on delete cascade,
  dados          jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);

-- Operadores de cobrança (entram com PIN)
create table if not exists public.cob_operadores (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  nome               text not null,
  pin_hash           text not null,
  ativo              boolean not null default true,
  pode_protestar     boolean not null default false,
  pode_disparar_lote boolean not null default false,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  unique (empresa_id, nome)
);

-- Registros de cobrança (cada contato feito pelo operador)
create table if not exists public.cob_registros (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  criado_em           timestamptz not null default now(),
  dia                 date not null,               -- dia local do registro (regra: 1 registro por documento por dia)
  operador_id         uuid,
  operador_nome       text,
  usuario_parallello  text,
  cliente_codigo      text not null,
  cliente_nome        text,
  documento           text not null,
  valor               numeric(14,2),
  vendedor            text,
  parcela             integer,
  observacao          text,
  resultado_codigo    text,
  resultado_descricao text,
  proxima             boolean not null default false,
  data_prevista       date,
  hora_prevista       text,
  situacao_codigo     text,
  situacao_descricao  text,
  erp_gravado         boolean not null default false,
  erp_numero          text,
  erp_erro            text,
  titulo_pago         boolean not null default false,
  pago_verificado_em  timestamptz
);
create unique index if not exists cob_registros_um_por_dia on public.cob_registros (empresa_id, upper(documento), dia);
create index if not exists cob_registros_doc     on public.cob_registros (empresa_id, upper(documento), criado_em desc);
create index if not exists cob_registros_cliente on public.cob_registros (empresa_id, cliente_codigo, criado_em desc);
create index if not exists cob_registros_dia     on public.cob_registros (empresa_id, dia);

-- Eventos: e-mails, WhatsApp, PIX e protestos
create table if not exists public.cob_eventos (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  criado_em          timestamptz not null default now(),
  dia                date not null,
  operador_id        uuid,
  operador_nome      text,
  usuario_parallello text,
  tipo               text not null check (tipo in ('email','whatsapp','protesto','pix')),
  subtipo            text,           -- notificacao, cobranca, todos, lote, ...
  cliente_codigo     text,
  cliente_nome       text,
  documentos         text[],
  destino            text,           -- e-mail ou telefone
  assunto            text,
  status             text not null,  -- enviado, falha, sem_email, aberto, feito
  erro               text,
  lote_id            uuid
);
create index if not exists cob_eventos_cliente on public.cob_eventos (empresa_id, cliente_codigo, criado_em desc);
create index if not exists cob_eventos_dia     on public.cob_eventos (empresa_id, dia);
create index if not exists cob_eventos_lote    on public.cob_eventos (empresa_id, lote_id);

-- Tabelas criadas pelo script avulso: empresa_id texto -> uuid ligado à empresa
do $$
declare t text;
begin
  foreach t in array array['cob_config','cob_operadores','cob_registros','cob_eventos'] loop
    if (select data_type from information_schema.columns
        where table_schema = 'public' and table_name = t and column_name = 'empresa_id') = 'text' then
      execute format('alter table public.%I alter column empresa_id type uuid using empresa_id::uuid', t);
      execute format('alter table public.%I add foreign key (empresa_id) references public.empresas(id) on delete cascade', t);
    end if;
  end loop;
end $$;

-- Último registro de cada documento e de cada cliente (o painel lê daqui)
create or replace view public.cob_ultimo_registro_doc with (security_invoker = true) as
  select distinct on (empresa_id, upper(documento)) *
  from public.cob_registros
  order by empresa_id, upper(documento), criado_em desc;

create or replace view public.cob_ultimo_registro_cliente with (security_invoker = true) as
  select distinct on (empresa_id, cliente_codigo) *
  from public.cob_registros
  order by empresa_id, cliente_codigo, criado_em desc;

-- Envios de WhatsApp por cliente (contador da planilha)
create or replace view public.cob_whatsapp_por_cliente with (security_invoker = true) as
  select empresa_id, cliente_codigo, count(*)::int as envios, max(criado_em) as ultimo
  from public.cob_eventos
  where tipo = 'whatsapp'
  group by empresa_id, cliente_codigo;

-- Último e-mail por cliente
create or replace view public.cob_ultimo_email_cliente with (security_invoker = true) as
  select distinct on (empresa_id, cliente_codigo) empresa_id, cliente_codigo, subtipo, status, criado_em
  from public.cob_eventos
  where tipo = 'email' and status = 'enviado'
  order by empresa_id, cliente_codigo, criado_em desc;

-- "Verificar títulos pagos": o documento que saiu do Contas a Receber vira pago
create or replace function public.cob_marcar_pagos(p_empresa uuid, p_docs_abertos text[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.pode_cobranca(p_empresa) then raise exception 'Sem permissão para esta operação.'; end if;
  update public.cob_registros r
     set titulo_pago = not (upper(r.documento) = any (p_docs_abertos)),
         pago_verificado_em = now()
   where r.empresa_id = p_empresa
     and r.titulo_pago is distinct from not (upper(r.documento) = any (p_docs_abertos));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ------------------------------------------------------------
-- Acesso (RLS)
-- ------------------------------------------------------------
create or replace function public.pode_cobranca(p_empresa uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_modulos text[];
begin
  if coalesce(public.eh_super(), false) then return true; end if;
  if p_empresa is null or p_empresa is distinct from public.minha_empresa() or not coalesce(public.usuario_liberado(), false) then
    return false;
  end if;
  -- liberação por módulo (005_parallello.sql): se ainda não existe no banco, vale só a empresa
  if to_regprocedure('public.modulos_permitidos(uuid)') is null then return true; end if;
  execute 'select public.modulos_permitidos($1)' into v_modulos using auth.uid();
  return v_modulos is null or 'cobranca' = any (v_modulos);
end $$;
revoke execute on function public.pode_cobranca(uuid) from public, anon;
grant execute on function public.pode_cobranca(uuid) to authenticated;

alter table public.cob_config     enable row level security;
alter table public.cob_operadores enable row level security;
alter table public.cob_registros  enable row level security;
alter table public.cob_eventos    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cob_config','cob_operadores','cob_registros','cob_eventos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_acesso', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.pode_cobranca(empresa_id)) with check (public.pode_cobranca(empresa_id))', t || '_acesso', t);
  end loop;
end $$;

revoke all on public.cob_config, public.cob_operadores, public.cob_registros, public.cob_eventos from anon;
revoke all on public.cob_ultimo_registro_doc, public.cob_ultimo_registro_cliente, public.cob_whatsapp_por_cliente, public.cob_ultimo_email_cliente from anon;
grant select, insert, update, delete on public.cob_config, public.cob_operadores, public.cob_registros, public.cob_eventos to authenticated;
grant select on public.cob_ultimo_registro_doc, public.cob_ultimo_registro_cliente, public.cob_whatsapp_por_cliente, public.cob_ultimo_email_cliente to authenticated;
revoke execute on function public.cob_marcar_pagos(uuid, text[]) from public, anon;
grant execute on function public.cob_marcar_pagos(uuid, text[]) to authenticated;
