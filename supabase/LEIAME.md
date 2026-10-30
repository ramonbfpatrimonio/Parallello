# Nuvem do Parallello (Supabase)

É o mesmo projeto que era do Gerar Pré-Venda (`pgbwgdnclmzlszvacdfo`). Empresas, usuários, licença/cobrança,
conexões com o banco e liberação de módulos ficam aqui e valem para todos os sistemas do Parallello.

## Atualizar para o login do Parallello (uma vez)

1. **SQL Editor** → cole e rode `migrations/005_parallello.sql` (pode rodar de novo sem problema).
   Cria o nome de login (`perfis.usuario`), a permissão de módulos de cada usuário (`perfis.modulos`), os módulos
   que cada um escolheu ver (`perfis.modulos_visiveis`), os contratados por empresa (`empresas.modulos`) e as
   funções que mudam isso. Se você já tinha rodado uma versão anterior deste arquivo, rode de novo.
2. **Edge Functions → admin-usuarios** → substitua pelo novo `functions/admin-usuarios/index.ts` → **Deploy**.
   Agora cria usuários pelo nome de login (ex.: `joao` vira `joao@parallello.app` por dentro).
3. **Edge Functions → login-master** → substitua pelo novo `functions/login-master/index.ts` → **Deploy**.
   Agora aceita o usuário `administrador` com a senha master do Parallello.
4. (Opcional) **Edge Functions → Secrets** → `PARALLELLO_SUPER_EMAIL` = e-mail da sua conta de super administrador.
   É a conta que a senha master abre na nuvem. Sem o segredo, usa o super administrador ativo mais antigo.

> Depois da atualização, a tela inicial de todo mundo começa vazia: cada um abre **Liberar módulos** e marca os
> sistemas que usa. Operadores só conseguem marcar o que tiverem permissão (Configuração > Usuários).

## Como o login funciona

| Quem | Usuário | Senha |
|---|---|---|
| Suporte (você) | `administrador` | `P@r@llell0` + data do computador (DDMMAAAA) |
| Usuários novos | o nome de login criado em Configuração > Usuários (ex.: `joao`) | a definida no cadastro |
| Usuários antigos do Gerar Pré-Venda | o e-mail de sempre | a de sempre |

- A senha master funciona **sem internet** (para instalar e configurar). Com internet, ela também abre a sua
  conta de super administrador na nuvem.
- Quem já entrou com internet naquele computador consegue entrar sem internet por 7 dias.
- Licença vencida (passou da tolerância), empresa bloqueada ou usuário desativado: o Parallello não deixa entrar.

## Testes das regras do banco

Num PostgreSQL comum (sem Supabase): `PGHOST=... PGUSER=postgres sh tests/sql/rodar.sh`
(ou `PGHOST=... npm test`, que roda junto com os outros testes).
