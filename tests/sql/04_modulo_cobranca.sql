-- Testes do 007 (módulo Cobrança). Rodar depois de 01, 02 e 03.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
update public.empresas set ativa = true, modulos = null where id = 'bbbbbbbb-0000-0000-0000-000000000000';
update public.perfis set ativo = true, modulos = '{cobranca}' where id = 'b0000000-0000-0000-0000-00000000000b';

select id as hage from public.empresas where nome = 'Hage' \gset
-- ---------------------------------------------------------------- admin da Norte grava na própria empresa
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000a';
insert into public.cob_config (empresa_id, dados) values ('bbbbbbbb-0000-0000-0000-000000000000', '{"pix":{"chave":"x"}}');
insert into public.cob_operadores (empresa_id, nome, pin_hash) values ('bbbbbbbb-0000-0000-0000-000000000000', 'ANA', 'h');
insert into public.cob_registros (empresa_id, dia, cliente_codigo, documento, valor) values ('bbbbbbbb-0000-0000-0000-000000000000', '2026-11-18', '00012', '100/A', 10);
insert into public.cob_eventos (empresa_id, dia, tipo, status, cliente_codigo) values ('bbbbbbbb-0000-0000-0000-000000000000', '2026-11-18', 'whatsapp', 'aberto', '00012');
do $$ begin
  begin
    insert into public.cob_registros (empresa_id, dia, cliente_codigo, documento) values ('bbbbbbbb-0000-0000-0000-000000000000', '2026-11-18', '00012', '100/a');
  exception when unique_violation then return; end;
  raise exception 'FALHOU: dois registros do mesmo documento no mesmo dia';
end $$;
select set_config('teste.hage', :'hage', false) \g /dev/null
do $$ begin
  assert not public.pode_cobranca(null), 'empresa nula nunca libera';
  begin
    insert into public.cob_config (empresa_id, dados) values (current_setting('teste.hage')::uuid, '{}');
  exception when insufficient_privilege then return; end;
  raise exception 'FALHOU: admin da Norte gravou na configuração da Hage';
end $$;
do $$ begin
  assert (select count(*) from public.cob_ultimo_registro_doc) = 1, 'view do último registro por documento';
  assert (select envios from public.cob_whatsapp_por_cliente where cliente_codigo = '00012') = 1, 'contador de WhatsApp';
  assert public.cob_marcar_pagos('bbbbbbbb-0000-0000-0000-000000000000', '{}') = 1, 'documento fora do Contas a Receber vira pago';
end $$;
\echo '✓ admin grava na própria empresa; um registro por documento por dia; views e "verificar pagos" funcionam'

-- ---------------------------------------------------------------- outra empresa não vê nada
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000a';  -- admin da Hage
do $$ begin
  assert (select count(*) from public.cob_registros) = 0, 'Hage não vê registros da Norte';
  assert (select count(*) from public.cob_operadores) = 0, 'Hage não vê operadores da Norte';
  assert (select count(*) from public.cob_ultimo_registro_doc) = 0, 'Hage não vê pela view';
  begin perform public.cob_marcar_pagos('bbbbbbbb-0000-0000-0000-000000000000', '{}'); exception when others then return; end;
  raise exception 'FALHOU: Hage marcou pagos da Norte';
end $$;
\echo '✓ cada empresa só vê e altera a própria cobrança'

-- ---------------------------------------------------------------- operador: só com o módulo liberado
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000b';
do $$ begin assert (select count(*) from public.cob_registros) = 1, 'operador com Cobrança liberada vê'; end $$;
reset role;
update public.perfis set modulos = '{acompanhamento}' where id = 'b0000000-0000-0000-0000-00000000000b';
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.cob_registros) = 0, 'operador sem a Cobrança não vê';
  begin
    insert into public.cob_eventos (empresa_id, dia, tipo, status) values ('bbbbbbbb-0000-0000-0000-000000000000', '2026-11-18', 'email', 'enviado');
  exception when insufficient_privilege then return; end;
  raise exception 'FALHOU: operador sem a Cobrança gravou';
end $$;
\echo '✓ operador só acessa com o módulo Cobrança liberado'

-- ---------------------------------------------------------------- contrato da empresa e bloqueio
reset role;
update public.empresas set modulos = '{acompanhamento}' where id = 'bbbbbbbb-0000-0000-0000-000000000000';
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000a';
do $$ begin assert (select count(*) from public.cob_registros) = 0, 'empresa sem a Cobrança contratada: admin não vê'; end $$;
reset role;
update public.empresas set modulos = null, ativa = false where id = 'bbbbbbbb-0000-0000-0000-000000000000';
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000a';
do $$ begin assert (select count(*) from public.cob_registros) = 0, 'empresa bloqueada: não vê'; end $$;
reset role;
update public.empresas set ativa = true where id = 'bbbbbbbb-0000-0000-0000-000000000000';
set role anon;
do $$ begin
  begin perform count(*) from public.cob_registros; exception when insufficient_privilege then return; end;
  raise exception 'FALHOU: anon leu a cobrança';
end $$;
reset role;
\echo '✓ sem contrato, com empresa bloqueada ou sem login: sem acesso'
\echo 'TODOS OS TESTES DA COBRANÇA PASSARAM'
