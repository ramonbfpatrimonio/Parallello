import React, { useCallback, useEffect, useState } from 'react'
import { REGRAS_PADRAO } from '@shared/tipos'
import { Campo } from '../Modal.jsx'
import { mensagem } from '../util.js'

const api = () => window.parallello
const CORES = ['#1d6fd8', '#0f7b5c', '#7a3fc0', '#c2531c', '#a1162b', '#8a6a00', '#0f6e78', '#425466', '#b8326f', '#4d6b12']

const vazia = (empresaId = '') => ({
  id: '',
  empresaId,
  cliente: '',
  nome: '',
  cor: CORES[0],
  servidor: '',
  instancia: '',
  porta: null,
  autenticacao: 'sql',
  usuario: 'sa',
  temSenha: false,
  banco: '',
  driver: 'auto',
  criptografar: false,
  cnpjsEmpresa: [],
  ativo: true,
  regras: { ...REGRAS_PADRAO },
  atualizadoEm: '',
})

/**
 * Conexão única com o banco (SQL Server do ERP): vale para todos os sistemas do Parallello.
 * O cadastro fica na empresa (nuvem) e aparece em todos os computadores dela; a senha do SQL
 * fica só neste computador, cifrada pelo Windows.
 */
export function Conexoes({ avisar }) {
  const [dados, setDados] = useState(null)
  const [form, setForm] = useState(null)
  const [senha, setSenha] = useState('')
  const [teste, setTeste] = useState(null)
  const [ocupado, setOcupado] = useState('')
  const [regras, setRegras] = useState(false)

  const carregar = useCallback(async (manterId) => {
    try {
      const d = await api().config.conexoes()
      setDados(d)
      const escolhida = d.perfis.find((p) => p.id === manterId) ?? d.perfis[0]
      setForm(escolhida ? { ...escolhida } : vazia(d.empresa?.id))
      setSenha('')
      setTeste(null)
    } catch (e) {
      avisar(mensagem(e), 'erro')
    }
  }, [avisar])
  useEffect(() => {
    void carregar()
  }, [carregar])

  if (!dados || !form) return <p className="vazio">Carregando…</p>
  const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e })
  const setRegra = (k, v) => setForm({ ...form, regras: { ...form.regras, [k]: v } })
  const daEmpresa = !!dados.empresa
  const somenteSenha = daEmpresa && !dados.nuvem // sem internet: só a senha deste computador

  async function executar(nome, fn) {
    setOcupado(nome)
    try {
      await fn()
    } catch (e) {
      avisar(mensagem(e), 'erro')
    } finally {
      setOcupado('')
    }
  }

  const salvar = () =>
    executar('salvar', async () => {
      if (!form.cliente.trim() || !form.nome.trim() || !form.servidor.trim()) throw new Error('Preencha cliente, nome da conexão e servidor.')
      if (somenteSenha) {
        if (!form.id) throw new Error('Sem internet não dá para criar conexão da empresa.')
        await api().config.salvarSenhaConexao(form.id, senha)
        avisar('Senha guardada neste computador.')
      } else {
        const salvo = await api().config.salvarConexao({ ...form, porta: form.porta ? Number(form.porta) : null }, senha || undefined)
        avisar(daEmpresa ? `Conexão salva para todos os computadores de ${dados.empresa.nome}.` : 'Conexão salva neste computador.')
        await carregar(salvo.id)
        return
      }
      await carregar(form.id)
    })

  const testar = () =>
    executar('testar', async () => {
      setTeste(null)
      setTeste(await api().config.testarConexao({ ...form, porta: form.porta ? Number(form.porta) : null }, senha || undefined))
    })

  const excluir = () =>
    executar('excluir', async () => {
      if (!form.id) return
      if (!confirm(daEmpresa ? `Excluir a conexão ${form.cliente} › ${form.nome} de todos os computadores de ${dados.empresa.nome}?` : `Excluir a conexão ${form.cliente} › ${form.nome} deste computador?`)) return
      await api().config.excluirConexao(form.id)
      avisar('Conexão excluída.')
      await carregar()
    })

  const enviar = (p) =>
    executar('enviar', async () => {
      await api().config.enviarConexao(p.id)
      avisar(`Conexão ${p.cliente} › ${p.nome} enviada para ${dados.empresa.nome}.`)
      await carregar(p.id)
    })

  return (
    <section>
      <header className="pagina-cabeca">
        <div>
          <h1>Conexão com o banco</h1>
          <p>
            O banco do ERP (SQL Server) que todos os sistemas usam.
            {daEmpresa ? <> Vale para todos os computadores de <b>{dados.empresa.nome}</b>; a senha do SQL fica só neste computador.</> : ' Sem empresa da nuvem: as conexões ficam só neste computador.'}
          </p>
        </div>
        <div className="pagina-acoes">
          <button className="botao" onClick={() => { setForm(vazia(dados.empresa?.id)); setSenha(''); setTeste(null) }} disabled={somenteSenha}>Nova conexão</button>
        </div>
      </header>

      {somenteSenha && <p className="aviso-pagina">Sem internet: dá para informar a senha do SQL deste computador. Para criar ou alterar a conexão, entre com internet.</p>}
      {dados.locais.length > 0 && dados.nuvem && (
        <div className="aviso-pagina">
          Há conexões só deste computador. Envie para a empresa para os outros computadores usarem:{' '}
          {dados.locais.map((p) => (
            <button key={p.id} className="link" onClick={() => enviar(p)} disabled={!!ocupado}>{p.cliente} › {p.nome}</button>
          ))}
        </div>
      )}

      <div className="conexoes">
        <ul className="conexoes-lista">
          {dados.perfis.length === 0 && <li className="vazio">Nenhuma conexão ainda. Preencha ao lado e salve.</li>}
          {dados.perfis.map((p) => (
            <li key={p.id}>
              <button className={'conexao-item' + (form.id === p.id ? ' ativa' : '')} onClick={() => { setForm({ ...p }); setSenha(''); setTeste(null) }}>
                <span className="conexao-cor" style={{ background: p.cor }} />
                <span>
                  <b>{p.cliente} › {p.nome}</b>
                  <small>{p.servidor}{p.instancia ? `\\${p.instancia}` : ''} · {p.banco || 'sem banco'}</small>
                  <small className={p.temSenha || p.autenticacao === 'windows' ? '' : 'alerta-texto'}>{p.autenticacao === 'windows' ? 'Autenticação do Windows' : p.temSenha ? 'Senha guardada neste computador' : 'Falta a senha neste computador'}{p.ativo === false ? ' · desativada' : ''}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="cartao">
          <h2>{form.id ? `${form.cliente} › ${form.nome}` : 'Nova conexão'}</h2>
          <div className="grade-campos">
            <Campo rotulo="Cliente" dica="Agrupa as conexões (ex.: Hage). No Indicador Logístico vira o grupo.">
              <input value={form.cliente} onChange={set('cliente')} disabled={somenteSenha} placeholder="Hage" />
            </Campo>
            <Campo rotulo="Nome da conexão">
              <input value={form.nome} onChange={set('nome')} disabled={somenteSenha} placeholder="COMERCIO" />
            </Campo>
            <Campo rotulo="Servidor" dica='Igual ao "Nome do servidor" do Management Studio. Neste computador: localhost.'>
              <input value={form.servidor} onChange={set('servidor')} disabled={somenteSenha} placeholder="192.168.1.199" spellCheck={false} />
            </Campo>
            <Campo rotulo="Instância" dica="Só o que vem depois da barra (ex.: SQLEXPRESS). Vazio = padrão.">
              <input value={form.instancia} onChange={set('instancia')} disabled={somenteSenha} spellCheck={false} />
            </Campo>
            <Campo rotulo="Porta" dica="Vazio = 1433 ou a da instância.">
              <input value={form.porta ?? ''} onChange={(e) => setForm({ ...form, porta: e.target.value.replace(/\D/g, '') || null })} disabled={somenteSenha} />
            </Campo>
            <Campo rotulo="Banco de dados">
              {teste?.bancos?.length ? (
                <select value={form.banco} onChange={set('banco')} disabled={somenteSenha}>
                  <option value="">Escolha…</option>
                  {teste.bancos.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (
                <input value={form.banco} onChange={set('banco')} disabled={somenteSenha} placeholder="HAGE.0001.Log" spellCheck={false} />
              )}
            </Campo>
            <Campo rotulo="Autenticação">
              <select value={form.autenticacao} onChange={set('autenticacao')} disabled={somenteSenha}>
                <option value="sql">Usuário do SQL Server</option>
                <option value="windows">Windows (só Gerar Pré-Venda, driver nativo)</option>
              </select>
            </Campo>
            {form.autenticacao === 'sql' && (
              <>
                <Campo rotulo="Usuário do SQL">
                  <input value={form.usuario} onChange={set('usuario')} disabled={somenteSenha} spellCheck={false} />
                </Campo>
                <Campo rotulo="Senha deste computador" dica={form.temSenha ? 'Já guardada. Digite só para trocar.' : 'É guardada ao salvar, cifrada pelo Windows.'}>
                  <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder={form.temSenha ? '••••••' : ''} />
                </Campo>
              </>
            )}
            <Campo rotulo="Driver">
              <select value={form.driver} onChange={set('driver')} disabled={somenteSenha}>
                <option value="auto">Automático</option>
                <option value="tedious">TCP/IP (padrão)</option>
                <option value="msnodesqlv8" disabled={!dados.nativo}>ODBC nativo{dados.nativo ? '' : ' (não instalado)'}</option>
              </select>
            </Campo>
          </div>

          <div className="linha-marcadores">
            <label className="marcador"><input type="checkbox" checked={!!form.criptografar} onChange={set('criptografar')} disabled={somenteSenha} /> Criptografar conexão (TLS)</label>
            <label className="marcador"><input type="checkbox" checked={form.ativo !== false} onChange={set('ativo')} disabled={somenteSenha} /> Conexão ativa</label>
            <span className="cores" role="radiogroup" aria-label="Cor no Gerar Pré-Venda">
              {CORES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={form.cor === c} className={'cor' + (form.cor === c ? ' escolhida' : '')} style={{ background: c }} onClick={() => !somenteSenha && setForm({ ...form, cor: c })} title="Cor da faixa no Gerar Pré-Venda" />
              ))}
            </span>
          </div>

          <button className="link" onClick={() => setRegras((r) => !r)} aria-expanded={regras}>
            {regras ? 'Esconder' : 'Mostrar'} as regras do Gerar Pré-Venda para esta conexão
          </button>
          {regras && (
            <div className="grade-campos regras">
              <Campo rotulo="Equipe"><input value={form.regras.equipe} onChange={(e) => setRegra('equipe', e.target.value)} disabled={somenteSenha} /></Campo>
              <Campo rotulo="Vendedor"><input value={form.regras.vendedor} onChange={(e) => setRegra('vendedor', e.target.value)} disabled={somenteSenha} /></Campo>
              <Campo rotulo="Setor padrão"><input value={form.regras.setorPadrao} onChange={(e) => setRegra('setorPadrao', e.target.value)} disabled={somenteSenha} /></Campo>
              <Campo rotulo="Dígitos do código do produto"><input value={form.regras.digitosCodigoProduto} onChange={(e) => setRegra('digitosCodigoProduto', Number(e.target.value.replace(/\D/g, '')) || 0)} disabled={somenteSenha} /></Campo>
              <Campo rotulo="Dígitos do setor"><input value={form.regras.digitosSetor} onChange={(e) => setRegra('digitosSetor', Number(e.target.value.replace(/\D/g, '')) || 0)} disabled={somenteSenha} /></Campo>
              <Campo rotulo="CSTs com ST" dica="Separados por vírgula."><input value={(form.regras.cstsComST ?? []).join(', ')} onChange={(e) => setRegra('cstsComST', e.target.value.split(/[,\s]+/).filter(Boolean))} disabled={somenteSenha} /></Campo>
              <Campo rotulo="Tipo do evento no ERP"><input value={form.regras.tipoEvento} onChange={(e) => setRegra('tipoEvento', e.target.value)} disabled={somenteSenha} /></Campo>
              <label className="marcador"><input type="checkbox" checked={form.regras.setorPelasColunasVendedor} onChange={(e) => setRegra('setorPelasColunasVendedor', e.target.checked)} disabled={somenteSenha} /> Setor pelas colunas Vendedor1..5 do cliente</label>
              <label className="marcador"><input type="checkbox" checked={form.regras.registrarEvento} onChange={(e) => setRegra('registrarEvento', e.target.checked)} disabled={somenteSenha} /> Registrar em EventosSistema</label>
            </div>
          )}

          {teste && (
            <div className={'resultado-teste ' + (teste.ok ? 'ok' : 'falhou')}>
              <b>{teste.ok ? `Conectou${teste.driverUsado ? ` (${teste.driverUsado})` : ''}.` : 'Não conectou.'}</b>
              {teste.erro && <p>{teste.erro}</p>}
              <ul>
                {(teste.itens ?? []).map((i, n) => (
                  <li key={n} className={i.ok ? 'ok' : i.aviso ? 'aviso' : 'falhou'}>{i.titulo}{i.detalhe ? `: ${i.detalhe}` : ''}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="cartao-acoes">
            {form.id && !somenteSenha && <button className="botao perigo" onClick={excluir} disabled={!!ocupado}>Excluir</button>}
            <span className="espaco" />
            <button className="botao" onClick={testar} disabled={!!ocupado || !form.servidor.trim()}>{ocupado === 'testar' ? 'Testando…' : 'Testar conexão'}</button>
            <button className="botao primario" onClick={salvar} disabled={!!ocupado || (somenteSenha && !senha)}>{ocupado === 'salvar' ? 'Salvando…' : somenteSenha ? 'Guardar senha' : 'Salvar'}</button>
          </div>
        </div>
      </div>
    </section>
  )
}
