import React, { useEffect, useState } from 'react';
import { useCobranca } from '../contexto.js';
import { CONFIG_PADRAO, MODELOS_PADRAO, RESULTADOS_PADRAO } from '../logica/padroes.js';
import { gerarPixCopiaCola } from '../logica/pix.js';
import { rotulosFaixas } from '../logica/calculos.js';
import { Abas, Botao, Campo, Confirmar, Modal, Selo, Vazio, useAviso } from '../telas/ui.jsx';
import { PixBox } from '../telas/PixBox.jsx';

export function AreaSistema({ onFechar }) {
  const [aba, setAba] = useState('operadores');
  return (
    <div className="cob-pagina">
      <header className="cob-cabecalho">
        <div>
          <h1>Área do sistema · Cobrança</h1>
          <p>Configurações salvas na nuvem, só para esta empresa. Aberta com a senha do Parallello.</p>
        </div>
        <Botao onClick={onFechar}>Voltar</Botao>
      </header>
      <Abas ativa={aba} onTrocar={setAba} abas={[
        { id: 'operadores', rotulo: 'Operadores' },
        { id: 'financeiro', rotulo: 'Financeiro e PIX' },
        { id: 'modelos', rotulo: 'Modelos de mensagem' },
        { id: 'resultados', rotulo: 'Resultados de contato' },
        { id: 'regras', rotulo: 'Faixas e regras' },
        { id: 'email', rotulo: 'E-mail (SMTP)' },
      ]} />
      <div className="cob-area-corpo">
        {aba === 'operadores' && <Operadores />}
        {aba === 'financeiro' && <Financeiro />}
        {aba === 'modelos' && <Modelos />}
        {aba === 'resultados' && <Resultados />}
        {aba === 'regras' && <Regras />}
        {aba === 'email' && <TesteSmtp />}
      </div>
    </div>
  );
}

// ---------- salvar uma parte da configuração ----------
function useParteConfig(chave) {
  const { config, salvarConfig, operador, usuario } = useCobranca();
  const avisar = useAviso();
  const [valor, setValor] = useState(config[chave]);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setValor(config[chave]); }, [config, chave]);
  const alterado = JSON.stringify(valor) !== JSON.stringify(config[chave]);
  const salvar = async () => {
    setSalvando(true);
    try { await salvarConfig({ ...config, [chave]: valor }, operador?.nome || usuario); avisar('Configuração salva na nuvem.'); }
    catch (e) { avisar(`Não foi possível salvar: ${e.message}`, 'erro'); }
    finally { setSalvando(false); }
  };
  const desfazer = () => setValor(config[chave]);
  return { valor, setValor, salvar, salvando, alterado, desfazer };
}

function BarraSalvar({ alterado, salvando, salvar, desfazer, padrao }) {
  return (
    <div className="cob-barra-salvar">
      {alterado ? <span className="cob-txt-laranja">Alterações não salvas</span> : <span className="cob-pequeno">Tudo salvo</span>}
      {padrao && <Botao pequeno onClick={padrao}>Restaurar padrão</Botao>}
      <Botao pequeno disabled={!alterado} onClick={desfazer}>Desfazer</Botao>
      <Botao variante="primario" disabled={!alterado} carregando={salvando} onClick={salvar}>Salvar</Botao>
    </div>
  );
}

// ---------- operadores ----------
function Operadores() {
  const { nuvem } = useCobranca();
  const avisar = useAviso();
  const [lista, setLista] = useState(null);
  const [editando, setEditando] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const carregar = async () => { try { setLista(await nuvem.listarOperadores()); } catch (e) { avisar(e.message, 'erro'); setLista([]); } };
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="cob-area-topo">
        <p className="cob-texto">Cada operador entra na Cobrança com o próprio PIN. O nome dele vai em cada registro, no histórico do ERP e no resumo de ligações.</p>
        <Botao variante="primario" onClick={() => setEditando({ ativo: true })}>Novo operador</Botao>
      </div>
      {!lista ? <span className="cob-spin cob-spin-g" /> : !lista.length ? <Vazio titulo="Nenhum operador" texto="Cadastre o primeiro operador de cobrança." /> : (
        <div className="cob-tabela-caixa cob-tabela-estreita">
          <table className="cob-tabela cob-tabela-simples">
            <thead><tr><th>Nome</th><th>Situação</th><th>Pode protestar</th><th>Disparo em lote</th><th /></tr></thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.nome}</strong></td>
                  <td>{o.ativo ? <Selo tipo="verde">Ativo</Selo> : <Selo tipo="cinza">Desativado</Selo>}</td>
                  <td>{o.pode_protestar ? 'Sim' : 'Não'}</td>
                  <td>{o.pode_disparar_lote ? 'Sim' : 'Não'}</td>
                  <td className="dir">
                    <Botao pequeno onClick={() => setEditando(o)}>Editar</Botao>{' '}
                    <Botao pequeno variante="perigo" onClick={() => setExcluindo(o)}>Excluir</Botao>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editando && <EditarOperador op={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar(); }} />}
      {excluindo && (
        <Confirmar titulo="Excluir operador" perigo rotuloOk="Excluir" onFechar={() => setExcluindo(null)}
          texto={<p>Excluir <strong>{excluindo.nome}</strong>? Os registros que ele já fez continuam no histórico. Para só bloquear o acesso, use Editar → Desativado.</p>}
          onOk={async () => { try { await nuvem.excluirOperador(excluindo.id); setExcluindo(null); carregar(); avisar('Operador excluído.'); } catch (e) { avisar(e.message, 'erro'); } }} />
      )}
    </div>
  );
}

function EditarOperador({ op, onFechar, onSalvo }) {
  const { nuvem } = useCobranca();
  const avisar = useAviso();
  const [f, setF] = useState({ nome: op.nome || '', pin: '', pin2: '', ativo: op.ativo !== false, pode_protestar: Boolean(op.pode_protestar), pode_disparar_lote: Boolean(op.pode_disparar_lote) });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const novo = !op.id;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const salvar = async () => {
    setErro('');
    if (!f.nome.trim()) { setErro('Informe o nome.'); return; }
    if (novo || f.pin) {
      if (!/^\d{4,8}$/.test(f.pin)) { setErro('O PIN deve ter de 4 a 8 números.'); return; }
      if (f.pin !== f.pin2) { setErro('A confirmação do PIN não confere.'); return; }
    }
    setSalvando(true);
    try {
      await nuvem.salvarOperador({ id: op.id, nome: f.nome, pin: f.pin || undefined, ativo: f.ativo, pode_protestar: f.pode_protestar, pode_disparar_lote: f.pode_disparar_lote });
      avisar(novo ? 'Operador cadastrado.' : 'Operador atualizado.');
      onSalvo();
    } catch (e) {
      setErro(/duplicate|unique/i.test(e.message) ? 'Já existe um operador com esse nome.' : e.message);
    } finally { setSalvando(false); }
  };

  return (
    <Modal titulo={novo ? 'Novo operador' : `Editar ${op.nome}`} onFechar={onFechar} largura={520}
      rodape={(<><Botao onClick={onFechar}>Cancelar</Botao><Botao variante="primario" carregando={salvando} onClick={salvar}>Salvar</Botao></>)}>
      <div className="cob-form">
        <Campo rotulo="Nome do operador" largo><input value={f.nome} onChange={(e) => set('nome', e.target.value.toUpperCase())} maxLength={40} /></Campo>
        <Campo rotulo={novo ? 'PIN (4 a 8 números)' : 'Novo PIN'} dica={novo ? '' : 'Deixe em branco para manter o atual'}>
          <input type="password" inputMode="numeric" value={f.pin} onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))} maxLength={8} autoComplete="new-password" />
        </Campo>
        <Campo rotulo="Confirmar PIN">
          <input type="password" inputMode="numeric" value={f.pin2} onChange={(e) => set('pin2', e.target.value.replace(/\D/g, ''))} maxLength={8} autoComplete="new-password" />
        </Campo>
        <label className="cob-check"><input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Ativo (pode entrar na Cobrança)</label>
        <label className="cob-check"><input type="checkbox" checked={f.pode_protestar} onChange={(e) => set('pode_protestar', e.target.checked)} /> Pode protestar títulos no ERP</label>
        <label className="cob-check"><input type="checkbox" checked={f.pode_disparar_lote} onChange={(e) => set('pode_disparar_lote', e.target.checked)} /> Pode fazer o disparo de e-mails em lote</label>
      </div>
      {erro && <div className="cob-campo-erro">{erro}</div>}
    </Modal>
  );
}

// ---------- financeiro e PIX ----------
function Financeiro() {
  const { erp } = useCobranca();
  const p = useParteConfig('financeiro');
  const v = p.valor;
  const set = (k, val) => p.setValor((x) => ({ ...x, [k]: val }));
  const t = (k, rotulo, dica, largo) => (
    <Campo rotulo={rotulo} dica={dica} largo={largo}><input value={v[k] || ''} onChange={(e) => set(k, e.target.value)} /></Campo>
  );
  const exemplo = gerarPixCopiaCola(v, v.pixComValorDoTitulo ? 100 : 0);
  return (
    <div>
      <h4 className="cob-sub">Contato do financeiro (vai no rodapé dos e-mails e do WhatsApp)</h4>
      <div className="cob-form">
        {t('nomeEmpresa', 'Nome da empresa nas mensagens', 'Vazio = usa o nome fantasia do ERP')}
        {t('setor', 'Nome do setor')}
        {t('email', 'E-mail do financeiro', 'Vazio = usa o e-mail da empresa no ERP')}
        {t('telefone', 'Telefone / WhatsApp do financeiro')}
        {t('horario', 'Horário de atendimento')}
        {t('mensagemAdicional', 'Mensagem adicional (fim do rodapé)', '', true)}
      </div>
      <h4 className="cob-sub">Dados bancários e PIX</h4>
      <label className="cob-check"><input type="checkbox" checked={v.incluirDadosBancarios} onChange={(e) => set('incluirDadosBancarios', e.target.checked)} /> Incluir dados bancários e PIX nas mensagens</label>
      <div className="cob-form">
        {t('banco', 'Banco')}{t('agencia', 'Agência')}{t('conta', 'Conta')}{t('tipoConta', 'Tipo de conta')}
        {t('titular', 'Titular (recebedor do PIX)', 'Até 25 letras no PIX')}{t('cnpjTitular', 'CNPJ do titular')}
        <Campo rotulo="Tipo da chave PIX">
          <select value={v.tipoChavePix} onChange={(e) => set('tipoChavePix', e.target.value)}>
            {['CNPJ', 'CPF', 'E-mail', 'Celular', 'Aleatória'].map((o) => <option key={o}>{o}</option>)}
          </select>
        </Campo>
        {t('chavePix', 'Chave PIX')}
        {t('cidadePix', 'Cidade do recebedor (PIX)', 'Até 15 letras')}
      </div>
      <label className="cob-check"><input type="checkbox" checked={v.pixComValorDoTitulo} onChange={(e) => set('pixComValorDoTitulo', e.target.checked)} /> PIX com o valor do título (senão o cliente digita o valor)</label>
      <label className="cob-check"><input type="checkbox" checked={v.qrCodeNoEmail} onChange={(e) => set('qrCodeNoEmail', e.target.checked)} /> Colocar o QR code do PIX nos e-mails</label>
      {exemplo && (
        <>
          <h4 className="cob-sub">Teste do PIX {v.pixComValorDoTitulo ? '(exemplo de R$ 100,00)' : ''}</h4>
          <p className="cob-nota">Leia o QR code com o app do banco para conferir o recebedor antes de usar com clientes.</p>
          <PixBox payload={exemplo} valor={v.pixComValorDoTitulo ? 100 : 0} erp={erp} compacto />
        </>
      )}
      <BarraSalvar {...p} />
    </div>
  );
}

// ---------- modelos ----------
const VARIAVEIS = '{cliente} {empresa} {documento} {vencimento} {valor} {valor_original} {valor_atualizado} {dias} {encargos} {faixa} {bloco_titulo} {data_limite} {email_financeiro} {proximos_dias} {limite3} {total}';

function Modelos() {
  const p = useParteConfig('modelos');
  const [chave, setChave] = useState('notificacao');
  const m = p.valor[chave];
  const set = (campo, val) => p.setValor((x) => ({ ...x, [chave]: { ...x[chave], [campo]: val } }));
  return (
    <div>
      <p className="cob-nota">Variáveis que você pode usar: <code>{VARIAVEIS}</code>. No e-mail com todos os vencidos use {'{blocos_por_faixa}'} e {'{aviso_protesto}'}; no disparo em lote {'{blocos_a_vencer}'}; no WhatsApp {'{blocos_titulos}'}. O rodapé com contato, dados bancários e PIX entra sozinho no final.</p>
      <div className="cob-duas cob-duas-estreita">
        <div className="cob-lista-modelos">
          {Object.entries(p.valor).map(([k, mod]) => (
            <button key={k} type="button" className={`cob-item-modelo${k === chave ? ' ativo' : ''}`} onClick={() => setChave(k)}>{mod.nome}</button>
          ))}
        </div>
        <div className="cob-form">
          {'assunto' in m && <Campo rotulo="Assunto" largo><input value={m.assunto} onChange={(e) => set('assunto', e.target.value)} /></Campo>}
          {'assuntoUrgente' in m && <Campo rotulo="Assunto quando há título na 3ª faixa" largo><input value={m.assuntoUrgente} onChange={(e) => set('assuntoUrgente', e.target.value)} /></Campo>}
          {'assuntoProtesto' in m && <Campo rotulo="Assunto quando há título na última faixa" largo><input value={m.assuntoProtesto} onChange={(e) => set('assuntoProtesto', e.target.value)} /></Campo>}
          <Campo rotulo="Texto" largo><textarea rows={18} className="cob-mono" value={m.corpo} onChange={(e) => set('corpo', e.target.value)} /></Campo>
          <div><Botao pequeno onClick={() => p.setValor((x) => ({ ...x, [chave]: MODELOS_PADRAO[chave] }))}>Restaurar este modelo</Botao></div>
        </div>
      </div>
      <BarraSalvar {...p} />
    </div>
  );
}

// ---------- resultados de contato ----------
function Resultados() {
  const p = useParteConfig('resultados');
  const set = (i, campo, val) => p.setValor((l) => l.map((r, j) => (j === i ? { ...r, [campo]: val } : r)));
  return (
    <div>
      <p className="cob-nota">"Ligação" define o que conta no resumo de ligações. "Marca" faz o título entrar nos filtros Com acordo / Negociação.</p>
      <div className="cob-tabela-caixa">
        <table className="cob-tabela cob-tabela-simples cob-tabela-edicao">
          <thead><tr><th style={{ width: 70 }}>Código</th><th>Descrição</th><th>Grupo</th><th>Ligação</th><th>Marca</th><th /></tr></thead>
          <tbody>
            {p.valor.map((r, i) => (
              <tr key={i}>
                <td><input value={r.codigo} onChange={(e) => set(i, 'codigo', e.target.value)} maxLength={4} /></td>
                <td><input value={r.descricao} onChange={(e) => set(i, 'descricao', e.target.value)} /></td>
                <td><input value={r.grupo} onChange={(e) => set(i, 'grupo', e.target.value)} /></td>
                <td>
                  <select value={r.ligacao || ''} onChange={(e) => set(i, 'ligacao', e.target.value)}>
                    <option value="">Não é ligação</option><option value="atendida">Atendida</option><option value="nao_atendida">Não atendida</option>
                  </select>
                </td>
                <td>
                  <select value={r.marca || ''} onChange={(e) => set(i, 'marca', e.target.value)}>
                    <option value="">—</option><option value="acordo">Acordo</option><option value="negociacao">Negociação</option>
                  </select>
                </td>
                <td><button type="button" className="cob-x" onClick={() => p.setValor((l) => l.filter((_, j) => j !== i))} aria-label="Remover">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Botao pequeno onClick={() => p.setValor((l) => [...l, { grupo: 'Outros', codigo: String(l.length + 1).padStart(2, '0'), descricao: '', ligacao: '' }])}>Adicionar resultado</Botao>
      <BarraSalvar {...p} padrao={() => p.setValor(RESULTADOS_PADRAO)} />
    </div>
  );
}

// ---------- faixas e regras ----------
function Regras() {
  const p = useParteConfig('faixas');
  const v = p.valor;
  const n = (k, rotulo, dica) => (
    <Campo rotulo={rotulo} dica={dica}><input type="number" min={1} value={v[k]} onChange={(e) => p.setValor((x) => ({ ...x, [k]: Math.max(1, Number(e.target.value) || 1) }))} /></Campo>
  );
  const invalido = !(v.limite1 < v.limite2 && v.limite2 < v.limite3);
  const r = rotulosFaixas(v);
  return (
    <div>
      <div className="cob-form">
        {n('proximosDias', 'Dias de "Próximos dias" e do disparo em lote', 'Planilha: 7')}
        {n('limite1', 'Fim da 1ª faixa de atraso (dias)', 'Planilha: 30')}
        {n('limite2', 'Fim da 2ª faixa de atraso (dias)', 'Planilha: 60')}
        {n('limite3', 'Fim da 3ª faixa de atraso (dias)', 'Acima disso: última faixa / protesto')}
        {n('minimoObservacao', 'Mínimo de caracteres na descrição do registro', 'Planilha: 20')}
      </div>
      <p className="cob-nota">Faixas: {r.v1} · {r.v2} · {r.v3} · {r.v4}</p>
      {invalido && <div className="cob-campo-erro">Os limites precisam ser crescentes.</div>}
      <BarraSalvar {...p} alterado={p.alterado && !invalido} padrao={() => p.setValor(CONFIG_PADRAO.faixas)} />
    </div>
  );
}

// ---------- teste do SMTP ----------
function TesteSmtp() {
  const { erp } = useCobranca();
  const [r, setR] = useState(null);
  const [rodando, setRodando] = useState(false);
  const testar = async () => {
    setRodando(true); setR(null);
    try { setR({ ok: true, ...(await erp.testarSmtp()) }); } catch (e) { setR({ ok: false, erro: e.message }); } finally { setRodando(false); }
  };
  return (
    <div>
      <p className="cob-texto">Os e-mails saem pelo SMTP de cobrança cadastrado no ERP (Configurações Adm: servidor, conta, senha e porta de cobrança). Nada de senha fica guardada no Parallello.</p>
      <Botao variante="primario" carregando={rodando} onClick={testar}>Testar conexão com o SMTP</Botao>
      {r && (r.ok
        ? <p className="cob-txt-verde">Conexão OK · {r.host}:{r.port} · {r.user}</p>
        : <p className="cob-campo-erro">{r.erro}</p>)}
    </div>
  );
}
