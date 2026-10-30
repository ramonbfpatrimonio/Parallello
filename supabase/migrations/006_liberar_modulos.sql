-- Parallello: "Liberar módulos" grava tudo o que a pessoa marcar para a própria tela inicial.
-- A permissão (perfis.modulos / empresas.modulos) continua sendo conferida pelo programa na hora
-- de abrir o módulo, que mostra "Você não tem acesso ao módulo ...".
-- Pode rodar de novo sem problema.
create or replace function public.definir_meus_modulos(p_modulos text[])
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  v_final text[];
begin
  if not public.usuario_liberado() then raise exception 'Acesso bloqueado.'; end if;
  select coalesce(array_agg(distinct m order by m), '{}') into v_final
  from unnest(coalesce(p_modulos, '{}')) as m
  where m ~ '^[a-z0-9-]{1,60}$';
  update public.perfis set modulos_visiveis = v_final where id = auth.uid();
  return v_final;
end $$;
revoke execute on function public.definir_meus_modulos(text[]) from public, anon;
grant execute on function public.definir_meus_modulos(text[]) to authenticated;
