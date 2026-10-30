-- Testes do 005 (login do Parallello e liberação de módulos). Rodar depois de 01 e 02.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
update public.perfis set ativo = true where email = 'op@norte.com';  -- o 02 desativou
-- Usuário criado como a Edge Function cria: nome de login e módulos no app_metadata
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
 ('d0000000-0000-0000-0000-00000000000d', 'joao@parallello.app', '{"nome":"João"}',
  '{"empresa_id":"bbbbbbbb-0000-0000-0000-000000000000","papel":"operador","usuario":"Joao","modulos":["acompanhamento"]}');
do $$ begin
  assert (select usuario from perfis where id = 'd0000000-0000-0000-0000-00000000000d') = 'joao', 'usuario vem do app_metadata, em minúsculas';
  assert (select modulos from perfis where id = 'd0000000-0000-0000-0000-00000000000d') = '{acompanhamento}', 'módulos iniciais do app_metadata';
  assert (select modulos from perfis where email = 'admin@norte.com') = '{}', 'conta antiga começa sem módulos';
end $$;
do $$ begin
  begin
    insert into auth.users (email, raw_app_meta_data) values ('joao2@parallello.app', '{"usuario":"JOAO"}');
  exception when unique_violation then return; end;
  raise exception 'FALHOU: dois usuários com o mesmo login';
end $$;
\echo '✓ nome de login único (sem diferenciar maiúsculas) e módulos iniciais pelo app_metadata'

-- ---------------------------------------------------------------- operador não libera nada
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000b';  -- operador da Norte
do $$ begin
  begin perform public.definir_modulos('b0000000-0000-0000-0000-00000000000b', '{gerar-pre-venda}'); exception when others then return; end;
  raise exception 'FALHOU: operador liberou módulo para si';
end $$;
do $$ begin
  update public.perfis set nome = nome where id = auth.uid();  -- (sem permissão de coluna modulos)
  begin update public.perfis set modulos = '{gerar-pre-venda}' where id = auth.uid(); exception when insufficient_privilege then return; end;
  raise exception 'FALHOU: operador alterou a coluna modulos direto';
end $$;
reset role;
\echo '✓ operador não libera módulos (nem pela função, nem direto na tabela)'

-- ---------------------------------------------------------------- admin da Norte
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000a';
do $$ begin
  -- libera para si mesmo (a tela começa em branco e ele se libera)
  assert public.definir_modulos(auth.uid(), '{acompanhamento,gerar-pre-venda,acompanhamento,""}') = '{acompanhamento,gerar-pre-venda}', 'sem repetidos nem vazios';
  assert (select modulos from perfis where id = auth.uid()) = '{acompanhamento,gerar-pre-venda}', 'admin liberou para si';
  perform public.definir_modulos('d0000000-0000-0000-0000-00000000000d', '{indicador-logistico}');
  assert (select modulos from perfis where id = 'd0000000-0000-0000-0000-00000000000d') = '{indicador-logistico}', 'admin liberou para o operador';
  assert (select count(*) from eventos_sistema where entidade = 'módulos') = 2, 'liberações registradas nos eventos';
end $$;
do $$ begin
  begin perform public.definir_modulos('a0000000-0000-0000-0000-00000000000a', '{gerar-pre-venda}'); exception when others then return; end;
  raise exception 'FALHOU: admin da Norte liberou módulo para usuário da Hage';
end $$;
do $$ begin
  begin perform public.definir_modulos_empresa('bbbbbbbb-0000-0000-0000-000000000000', '{acompanhamento}'); exception when others then return; end;
  raise exception 'FALHOU: admin mudou os módulos contratados';
end $$;
reset role;
\echo '✓ admin libera módulos para a própria empresa (inclusive para si), não para outra empresa, nem muda o contrato'

-- ---------------------------------------------------------------- super: módulos contratados
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert public.definir_modulos_empresa('bbbbbbbb-0000-0000-0000-000000000000', '{acompanhamento,pesquisa-relatorios}') = '{acompanhamento,pesquisa-relatorios}', 'contrato da Norte';
end $$;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000a';  -- admin da Norte
do $$ begin
  assert public.definir_modulos(auth.uid(), '{acompanhamento,gerar-pre-venda,pesquisa-relatorios}') = '{acompanhamento,pesquisa-relatorios}', 'só libera o que a empresa contratou';
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert public.definir_modulos_empresa('bbbbbbbb-0000-0000-0000-000000000000', null) is null, 'null volta a ser todos';
  -- super libera qualquer módulo para qualquer um, inclusive para ele
  assert public.definir_modulos(auth.uid(), '{gerar-pre-venda}') = '{gerar-pre-venda}', 'super libera para si';
end $$;
reset role;
\echo '✓ super define os módulos contratados; o admin só libera o que foi contratado'

-- ---------------------------------------------------------------- cada um escolhe os módulos que vê
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';  -- super: contrato da Norte só acompanhamento e indicador
do $$ begin perform public.definir_modulos_empresa('bbbbbbbb-0000-0000-0000-000000000000', '{acompanhamento,indicador-logistico}'); end $$;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-00000000000d';  -- operador João: permitido indicador-logistico
do $$ begin
  assert public.definir_meus_modulos('{indicador-logistico,gerar-pre-venda,gerar-pre-venda}') = '{gerar-pre-venda,indicador-logistico}', 'operador libera o que quiser para a própria tela';
  assert (select modulos_visiveis from perfis where id = auth.uid()) = '{gerar-pre-venda,indicador-logistico}', 'gravou a escolha do operador';
  assert public.modulos_permitidos(auth.uid()) = '{indicador-logistico}', 'mas a permissão continua só indicador';
  begin update public.perfis set modulos_visiveis = '{gerar-pre-venda}' where id = auth.uid(); exception when insufficient_privilege then return; end;
  raise exception 'FALHOU: operador alterou modulos_visiveis direto';
end $$;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000a';  -- admin da Norte: vê os contratados
do $$ begin
  assert public.definir_meus_modulos('{acompanhamento,indicador-logistico,pesquisa-relatorios,''; drop''}') = '{acompanhamento,indicador-logistico,pesquisa-relatorios}', 'admin escolhe; texto estranho é ignorado';
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';  -- super vê tudo
do $$ begin
  assert public.definir_meus_modulos('{pesquisa-relatorios,gerar-pre-venda}') = '{gerar-pre-venda,pesquisa-relatorios}', 'super vê todos';
end $$;
reset role;
\echo '✓ cada usuário escolhe os módulos da própria tela; a permissão fica à parte'
\echo 'TODOS OS TESTES DO PARALLELLO PASSARAM'
