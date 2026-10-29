@echo off
rem ==================================================================
rem  Parallello - publicar uma versão nova
rem  Uso: dê dois cliques, ou no cmd:  publicar.cmd  [patch|minor|major]
rem     patch: 1.0.0 -> 1.0.1 (padrão)   minor: 1.0.5 -> 1.1.0   major: 1.4.2 -> 2.0.0
rem   1. confere o código (typecheck e testes)
rem   2. guarda as alterações no Git
rem   3. sobe a versão no package.json e cria a tag (ex.: v1.0.1)
rem   4. envia para o GitHub, que gera o instalador e publica o Release sozinho
rem ==================================================================
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set TIPO=%1
if "%TIPO%"=="" set TIPO=patch

git rev-parse --is-inside-work-tree >nul 2>&1 || (echo Esta pasta ainda nao esta ligada ao Git. Veja o LEIAME, secao "Publicar uma versao nova". & pause & exit /b 1)
git remote get-url origin >nul 2>&1 || (echo Falta o remoto "origin". Rode: git remote add origin https://ramonbfpatrimonio@github.com/ramonbfpatrimonio/Parallello.git & pause & exit /b 1)

echo.
echo Buscando o que ja esta no GitHub...
git pull --rebase --autostash origin main || (echo Nao foi possivel atualizar a partir do GitHub. Resolva e rode de novo. & pause & exit /b 1)

if not exist node_modules (
  echo Instalando dependencias...
  call npm install || (pause & exit /b 1)
)

echo.
echo Conferindo o codigo...
call npm run typecheck || (echo Corrija os erros acima antes de publicar. & pause & exit /b 1)
call npm test || (echo Os testes falharam. Nada foi publicado. & pause & exit /b 1)

git add -A
git diff --cached --quiet || git commit -m "Alterações para a próxima versão"

call npm version %TIPO% -m "Versão %%s" || (pause & exit /b 1)

git push origin HEAD --follow-tags || (echo Nao foi possivel enviar para o GitHub. & pause & exit /b 1)

for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set VERSAO=%%v
echo.
echo ============================================================
echo  Versao %VERSAO% enviada.
echo  O GitHub esta gerando o instalador (leva uns 5 a 10 minutos):
echo  https://github.com/ramonbfpatrimonio/Parallello/actions
echo  Quando terminar, o Release aparece em:
echo  https://github.com/ramonbfpatrimonio/Parallello/releases
echo  Depois disso, os computadores atualizam sozinhos.
echo ============================================================
pause
