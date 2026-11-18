import React, { useMemo, useState } from 'react';
import { useCobranca } from '../contexto.js';
import { montarLista, contarOcultosAgendados, rotulosFaixas, ehVencido } from '../logica/calculos.js';
import { moeda, moedaCurta, inteiro, percentual, dataBR } from '../logica/formato.js';
import { Botao, Selo, Vazio, useAviso } from './ui.jsx';
import { ModalRegistrar } from './ModalRegistrar.jsx';
import { ModalEmail } from './ModalEmail.jsx';
import { ModalWhatsApp } from './ModalWhatsApp.jsx';
import { ModalPix } from './ModalPix.jsx';
import { ModalHistorico } from './ModalHistorico.jsx';
import { ModalProtesto } from './ModalProtesto.jsx';

const POR_PAGINA = 40;
const NOME_EMAIL = { notificacao: 'Notificação', cobranca: 'Cobrança', todos: 'Cobrança (todos)', lote: 'Lembrete' };

export function corFaixa(faixa) {
  return { hoje: 'amarelo', prox: 'verde-agua', avencer: 'verde', v1: 'amarelo', v2: 'laranja', v3: 'vermelho', v4: 'vinho' }[faixa] || 'cinza';
}

function Kpi({ rotulo, valor, detalhe, cor, titulo }) {
  return (
    <div className={`cob-kpi cob-kpi-${cor || 'azul'}`} title={titulo}>
      <span className="cob-kpi-rotulo">{rotulo}</span>
      <strong className="cob-kpi-valor">{valor}</strong>
      {detalhe && <span className="cob-kpi-detalhe">{detalhe}</span>}
    </div>
  );
}

export function Painel() {
  const ctx = useCobranca();
  const { carteira, config, dadosErp, extras, ligacoesHoje, carregando, erroCarga, recarregar, nuvemDados, erp, operador } = ctx;
  const avisar = useAviso();
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [mostrarAgendados, setMostrarAgendados] = useState(false);
  const [abertos, setAbertos] = useState({});
  const [todosAbertos, setTodosAbertos] = useState(true);
  const [ordem, setOrdem] = useState({ campo: 'nome', dir: 1 });
  const [pagina, setPagina] = useState(0);
  const [modal, setModal] = useState(null);
  const [kpisAbertos, setKpisAbertos] = useState(true);

  const rot = useMemo(() => rotulosFaixas(config.faixas), [config.faixas]);

  const grupos = useMemo(() => {
    if (!carteira) return [];
    const g = montarLista({ titulos: carteira.titulos, filtro, busca, mostrarAgendados });
    if (filtro === 'top10') return g;
    const val = (x) => {
      switch (ordem.campo) {
        case 'valor': return x.valor;
        case 'valorAtual': return x.valorAtual;
        case 'vencido': return x.vencido;
        case 'dias': return x.maiorAtraso;
        case 'vencimento': return x.titulos[0]?.vencimento || '';
        case 'codigo': return x.codigo;
        default: return x.nome;
      }
    };
    return [...g].sort((a, b) => {
      const va = val(a); const vb = val(b);
      return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')) * ordem.dir;
    });
  }, [carteira, filtro, busca, mostrarAgendados, ordem]);

  const ocultos = useMemo(() => (carteira ? contarOcultosAgendados(carteira.titulos, filtro, busca) : 0), [carteira, filtro, busca]);
  const paginas = Math.max(1, Math.ceil(grupos.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);
  const visiveis = grupos.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA);

  const trocarFiltro = (f) => { setFiltro(f); setPagina(0); };
  const ordenar = (campo) => setOrdem((o) => ({ campo, dir: o.campo === campo ? -o.dir : (campo === 'nome' || campo === 'codigo' || campo === 'vencimento' ? 1 : -1) }));
  const seta = (campo) => (ordem.campo === campo ? (ordem.dir === 1 ? ' ▲' : ' ▼') : '');
  const aberto = (cod) => (abertos[cod] ?? todosAbertos);

  if (erroCarga) {
    return (
      <div className="cob-pagina">
        <div className="cob-cartao-estado">
          <h2>Não foi possível carregar os títulos</h2>
          <p>{erroCarga}</p>
          <Botao variante="primario" onClick={recarregar}>Tentar de novo</Botao>
        </div>
      </div>
    );
  }
  if (!carteira) {
    return <div className="cob-pagina cob-centro"><span className="cob-spin cob-spin-g" /> Carregando títulos do ERP…</div>;
  }

  const k = carteira.kpis;
  const c = carteira.contagens;
  const faixasBotoes = [
    ['todos', 'Todas', 'azul'], ['hoje', rot.hoje, 'amarelo'], ['avencer', rot.avencer, 'verde'], ['prox', rot.prox, 'verde-agua'],
    ['v1', rot.v1, 'laranja-claro'], ['v2', rot.v2, 'laranja'], ['v3', rot.v3, 'vermelho'], ['v4', rot.v4, 'vinho'],
    ['acordo', 'Com acordo', 'verde'], ['negociacao', 'Negociação', 'amarelo'],
  ];

  const exportar = async (formato) => {
    const colunas = [
      { chave: 'codigo', titulo: 'Código', largura: 9 }, { chave: 'cliente', titulo: 'Cliente', largura: 34 },
      { chave: 'doc', titulo: 'Documento', largura: 14 }, { chave: 'tipo', titulo: 'Tipo', largura: 7 },
      { chave: 'nf', titulo: 'NF', largura: 9 }, { chave: 'parcela', titulo: 'Parc.', largura: 6 },
      { chave: 'vendedor', titulo: 'Vendedor', largura: 14 }, { chave: 'emissao', titulo: 'Emissão', largura: 11 },
      { chave: 'vencimento', titulo: 'Vencimento', largura: 11 },
      { chave: 'valor', titulo: 'Valor original', largura: 14, alinhar: 'right', formato: 'moeda' },
      { chave: 'juros', titulo: 'Juros', largura: 11, alinhar: 'right', formato: 'moeda' },
      { chave: 'multa', titulo: 'Multa', largura: 11, alinhar: 'right', formato: 'moeda' },
      { chave: 'atual', titulo: 'Valor atual', largura: 14, alinhar: 'right', formato: 'moeda' },
      { chave: 'dias', titulo: 'Dias', largura: 6, alinhar: 'right' }, { chave: 'faixa', titulo: 'Faixa', largura: 14 },
      { chave: 'situacao', titulo: 'Situação', largura: 22 }, { chave: 'proximo', titulo: 'Próximo contato', largura: 13 },
    ];
    const linhas = [];
    for (const g of grupos) {
      linhas.push({ _grupo: true, codigo: g.codigo, cliente: g.nome, doc: g.documentoCliente, atual: moeda(g.valorAtual), atual_num: g.valorAtual, valor: moeda(g.valor), valor_num: g.valor });
      for (const t of g.titulos) {
        const r = t.ultimoRegistro;
        linhas.push({
          codigo: t.codigo, cliente: t.nome, doc: t.docPag, tipo: t.tipoDoc, nf: t.nf, parcela: t.parcela, vendedor: t.vendedor,
          emissao: dataBR(t.emissao), vencimento: dataBR(t.vencimento),
          valor: moeda(t.valor), valor_num: t.valor, juros: moeda(t.juros), juros_num: t.juros, multa: moeda(t.multa), multa_num: t.multa,
          atual: moeda(t.valorAtual), atual_num: t.valorAtual, dias: t.dias, faixa: rot[t.faixa],
          situacao: t.protestado ? 'PROTESTADO' : (r?.situacao_descricao || ''), proximo: r?.proxima ? dataBR(r.data_prevista) : '',
        });
      }
    }
    try {
      await erp.exportar({
        formato, arquivo: `cobranca-${ctx.hoje}`, titulo: 'Painel de cobrança',
        subtitulo: `${faixasBotoes.find((f) => f[0] === filtro)?.[1] || ''} · ${inteiro(grupos.length)} clientes · gerado em ${dataBR(ctx.hoje)} por ${operador?.nome || ''}`,
        colunas, linhas,
      });
    } catch (e) { avisar(e.message, 'erro'); }
  };

  const cobrado = extras.cobrado;
  const lig = ligacoesHoje;

  return (
    <div className="cob-pagina">
      <header className="cob-cabecalho">
        <div>
          <h1>Painel de cobrança</h1>
          <p>{dadosErp?.empresa?.nome || 'ERP'} · {inteiro(k.documentos)} títulos em aberto · {inteiro(k.clientes)} clientes</p>
        </div>
        <div className="cob-cabecalho-acoes">
          <Botao onClick={() => setKpisAbertos((v) => !v)}>{kpisAbertos ? 'Ocultar indicadores' : 'Mostrar indicadores'}</Botao>
          <Botao variante="primario" carregando={carregando} onClick={recarregar}>Atualizar dados</Botao>
        </div>
      </header>

      {kpisAbertos && (
        <>
          <section className="cob-kpis">
            <Kpi rotulo="Total a receber" valor={moeda(k.total)} cor="azul" />
            <Kpi rotulo="Total vencido" valor={moeda(k.vencido)} detalhe={`${percentual(k.percVencido)} da carteira`} cor="vermelho" />
            <Kpi rotulo="A vencer" valor={moeda(k.aVencer)} cor="verde" />
            <Kpi rotulo="Juros / multas" valor={moeda(k.juros + k.multas)} detalhe={`J ${moeda(k.juros)} · M ${moeda(k.multas)}`} cor="laranja" />
            <Kpi rotulo="Valor médio por título" valor={moeda(k.valorMedio)} cor="azul-claro" />
            <Kpi rotulo={`Perda estimada (+${config.faixas.limite3})`} valor={moeda(k.perdaEstimada)} detalhe={`${percentual(k.percPerda, 1)} dos títulos`} cor="vinho" />
            <Kpi rotulo="Maior devedor" valor={k.maiorDevedor ? moeda(k.maiorDevedor.valor) : '-'} detalhe={k.maiorDevedor ? `${k.maiorDevedor.nome.slice(0, 26)} · ${percentual(k.maiorDevedor.perc, 1)}` : 'Nenhum'} cor="roxo" />
          </section>
          <section className="cob-kpis cob-kpis-2">
            <Kpi rotulo="Clientes vencidos" valor={inteiro(k.clientesVencidos)} detalhe={`${inteiro(k.titulosVencidos)} títulos vencidos`} cor="vermelho" />
            <Kpi rotulo="Atraso médio / maior" valor={`${inteiro(k.mediaAtraso)} dias`} detalhe={`Maior atraso: ${inteiro(k.maiorAtraso)} dias`} cor="vinho" />
            <Kpi rotulo="Prazo médio de recebimento" valor={`${Number(dadosErp.prazoMedio || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`} cor="roxo" />
            <Kpi rotulo="Total recebido" valor={moedaCurta(dadosErp.recebido.geral)} detalhe={`No mês: ${moedaCurta(dadosErp.recebido.mes)}`} cor="verde-agua" />
            <Kpi rotulo="Cobrado e recebido" valor={cobrado ? moedaCurta(cobrado.geral) : '…'} detalhe={cobrado ? `No mês: ${moedaCurta(cobrado.mes)}` : 'calculando'} cor="azul" titulo="Títulos que tiveram registro de cobrança e já foram pagos" />
            <Kpi rotulo="Ligações hoje" valor={lig ? inteiro(lig.total) : '…'} detalhe={lig ? `${inteiro(lig.atendidas)} atendidas · ${inteiro(lig.naoAtendidas)} não` : ''} cor="cinza" />
            <Kpi rotulo="Taxa de atendimento" valor={lig ? percentual(lig.taxa) : '…'} detalhe="ligações de hoje" cor="amarelo" />
          </section>
        </>
      )}

      <section className="cob-faixas" aria-label="Filtros por faixa">
        {faixasBotoes.map(([id, rotulo, cor]) => (
          <button key={id} type="button" className={`cob-faixa cob-faixa-${cor}${filtro === id ? ' ativa' : ''}`} onClick={() => trocarFiltro(id)}>
            <span className="cob-faixa-rotulo">{rotulo}</span>
            <span className="cob-faixa-num">{inteiro(c[id].clientes)} cli. · {moedaCurta(c[id].valor)}</span>
          </button>
        ))}
        <button type="button" className={`cob-faixa cob-faixa-vinho${filtro === 'top10' ? ' ativa' : ''}`} onClick={() => trocarFiltro('top10')}>
          <span className="cob-faixa-rotulo">Top 10 devedores</span>
          <span className="cob-faixa-num">maior valor vencido</span>
        </button>
      </section>

      <section className="cob-barra">
        <input className="cob-busca" type="search" placeholder="Buscar por código, CPF/CNPJ, nome, documento ou NF…" value={busca}
          onChange={(e) => { setBusca(e.target.value); setPagina(0); }} />
        <div className="cob-barra-acoes">
          <Botao pequeno onClick={() => { setTodosAbertos((v) => !v); setAbertos({}); }}>{todosAbertos ? 'Recolher todos' : 'Expandir todos'}</Botao>
          <Botao pequeno onClick={() => exportar('xlsx')}>Excel</Botao>
          <Botao pequeno onClick={() => exportar('pdf')}>PDF</Botao>
          <Botao pequeno onClick={() => exportar('imprimir')}>Imprimir</Botao>
        </div>
      </section>

      {(ocultos > 0 || mostrarAgendados) && (
        <div className="cob-aviso-linha">
          {mostrarAgendados
            ? <>Mostrando também os títulos com retorno agendado para depois de hoje. <button type="button" className="cob-link" onClick={() => setMostrarAgendados(false)}>Esconder de novo</button></>
            : <>{inteiro(ocultos)} título(s) escondido(s) porque o retorno está agendado para depois de hoje. <button type="button" className="cob-link" onClick={() => setMostrarAgendados(true)}>Mostrar</button></>}
        </div>
      )}
      {filtro === 'top10' && <div className="cob-aviso-linha">Top 10: clientes com maior valor vencido (empate: maior atraso). Só aparecem os títulos vencidos.</div>}

      {!grupos.length ? (
        <Vazio titulo="Nenhum título encontrado" texto={busca ? 'Nada combina com a busca neste filtro.' : 'Não há títulos nesta faixa.'} />
      ) : (
        <div className="cob-tabela-caixa">
          <table className="cob-tabela">
            <thead>
              <tr>
                <th className="ord" onClick={() => ordenar('nome')}>Cliente / Documento{seta('nome')}</th>
                <th>Tipo</th>
                <th>NF</th>
                <th>Parc.</th>
                <th>Vendedor</th>
                <th className="ord" onClick={() => ordenar('vencimento')}>Vencimento{seta('vencimento')}</th>
                <th className="dir ord" onClick={() => ordenar('valor')}>Valor{seta('valor')}</th>
                <th className="dir">Juros</th>
                <th className="dir">Multa</th>
                <th className="dir ord" onClick={() => ordenar('valorAtual')}>Valor atual{seta('valorAtual')}</th>
                <th className="dir ord" onClick={() => ordenar('dias')}>Dias{seta('dias')}</th>
                <th>Faixa</th>
                <th>Último contato</th>
                <th>Próximo</th>
                <th>Situação</th>
                <th className="cob-col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((g) => (
                <GrupoCliente key={g.codigo} g={g} aberto={aberto(g.codigo)} rot={rot} nuvemDados={nuvemDados}
                  alternar={() => setAbertos((a) => ({ ...a, [g.codigo]: !aberto(g.codigo) }))}
                  abrir={(tipo, extra) => setModal({ tipo, grupo: g, ...extra })} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <div className="cob-paginacao">
          <Botao pequeno disabled={pag === 0} onClick={() => setPagina(pag - 1)}>‹ Anterior</Botao>
          <span>Página {pag + 1} de {paginas} · {inteiro(grupos.length)} clientes</span>
          <Botao pequeno disabled={pag >= paginas - 1} onClick={() => setPagina(pag + 1)}>Próxima ›</Botao>
        </div>
      )}

      <ModaisDoPainel modal={modal} fechar={() => setModal(null)} filtro={filtro} />
    </div>
  );
}

export function ModaisDoPainel({ modal, fechar, filtro }) {
  if (!modal) return null;
  const { tipo, grupo, titulo } = modal;
  if (tipo === 'registrar') return <ModalRegistrar grupo={grupo} titulo={titulo} onFechar={fechar} bloqueadoTop10={filtro === 'top10'} />;
  if (tipo === 'email') return <ModalEmail grupo={grupo} titulo={titulo} onFechar={fechar} />;
  if (tipo === 'emailTodos') return <ModalEmail grupo={grupo} todos onFechar={fechar} />;
  if (tipo === 'whatsapp') return <ModalWhatsApp grupo={grupo} onFechar={fechar} />;
  if (tipo === 'pix') return <ModalPix grupo={grupo} titulo={titulo} onFechar={fechar} />;
  if (tipo === 'historico') return <ModalHistorico grupo={grupo} onFechar={fechar} />;
  if (tipo === 'protestar') return <ModalProtesto grupo={grupo} titulo={titulo} onFechar={fechar} />;
  return null;
}

function GrupoCliente({ g, aberto, alternar, abrir, rot, nuvemDados }) {
  const whats = nuvemDados?.whats.get(g.codigo);
  const email = nuvemDados?.emails.get(g.codigo);
  const temVencido = g.titulos.some((t) => ehVencido(t.faixa));
  return (
    <>
      <tr className="cob-linha-cliente">
        <td colSpan={6}>
          <button type="button" className="cob-expandir" onClick={alternar} aria-expanded={aberto}>{aberto ? '▾' : '▸'}</button>
          <span className="cob-cod">{g.codigo}</span>
          <strong className="cob-nome-cli">{g.nome}</strong>
          <span className="cob-cli-meta">{g.documentoCliente || 'sem CPF/CNPJ'} · {g.telefone || 'sem telefone'} · {g.email || 'sem e-mail'}</span>
        </td>
        <td className="dir">{moeda(g.valor)}</td>
        <td colSpan={2} className="cob-cli-meta">{g.titulos.length} título(s)</td>
        <td className="dir"><strong>{moeda(g.valorAtual)}</strong></td>
        <td className="dir">{g.maiorAtraso || ''}</td>
        <td colSpan={4} className="cob-cli-meta">
          {whats ? `WhatsApp: ${whats.envios} envio(s)` : 'WhatsApp: 0'}{email ? ` · Últ. e-mail: ${NOME_EMAIL[email.subtipo] || 'E-mail'} ${dataBR(String(email.criado_em).slice(0, 10))}` : ''}
        </td>
        <td className="cob-col-acoes">
          <div className="cob-acoes">
            <button type="button" className="cob-acao cob-acao-whats" onClick={() => abrir('whatsapp')} title="Enviar WhatsApp">WhatsApp</button>
            <button type="button" className="cob-acao cob-acao-email" onClick={() => abrir('emailTodos')} disabled={!temVencido} title={temVencido ? 'E-mail com todos os vencidos' : 'Sem títulos vencidos'}>E-mail todos</button>
            <button type="button" className="cob-acao" onClick={() => abrir('historico')} title="Histórico do cliente">Histórico</button>
          </div>
        </td>
      </tr>
      {aberto && g.titulos.map((t) => {
        const r = t.ultimoRegistro;
        const erpH = t.ultimaCobrancaErp;
        const ultimo = r ? `${dataBR(String(r.criado_em).slice(0, 10))} · ${r.operador_nome || ''}` : (erpH?.data ? `${dataBR(erpH.data)} · ${erpH.usuario}` : '-');
        const situacao = r?.situacao_descricao || erpH?.situacao || '';
        return (
          <tr key={t.docPag} className={`cob-linha-titulo${t.faixa === 'v4' ? ' cob-linha-critica' : ''}`}>
            <td className="cob-doc">{t.docPag}</td>
            <td>{t.tipoDoc}</td>
            <td>{t.nf}</td>
            <td>{t.parcela}</td>
            <td>{t.vendedor}</td>
            <td>{dataBR(t.vencimento)}</td>
            <td className="dir">{moeda(t.valor)}</td>
            <td className="dir">{t.juros ? moeda(t.juros) : '-'}</td>
            <td className="dir">{t.multa ? moeda(t.multa) : '-'}</td>
            <td className="dir"><strong>{moeda(t.valorAtual)}</strong></td>
            <td className={`dir cob-dias cob-txt-${corFaixa(t.faixa)}`}>{t.dias || ''}</td>
            <td><Selo tipo={corFaixa(t.faixa)} title={t.acao}>{rot[t.faixa]}</Selo></td>
            <td className="cob-pequeno">{ultimo}</td>
            <td className="cob-pequeno">{r?.proxima && r.data_prevista ? `${dataBR(r.data_prevista)}${r.hora_prevista ? ` ${r.hora_prevista}` : ''}` : (erpH?.proximoContato ? dataBR(erpH.proximoContato) : '-')}</td>
            <td className="cob-pequeno">
              {t.protestado ? <Selo tipo="vinho">PROTESTADO</Selo> : null}
              {t.marca === 'acordo' && <Selo tipo="verde">Acordo</Selo>}
              {t.marca === 'negociacao' && <Selo tipo="amarelo">Negociação</Selo>}
              {!t.protestado && !t.marca && (situacao || '-')}
            </td>
            <td className="cob-col-acoes">
              <div className="cob-acoes">
                <button type="button" className="cob-acao cob-acao-principal" onClick={() => abrir('registrar', { titulo: t })}>Registrar</button>
                <button type="button" className="cob-acao" onClick={() => abrir('email', { titulo: t })} title={t.acao}>E-mail</button>
                <button type="button" className="cob-acao" onClick={() => abrir('pix', { titulo: t })}>PIX</button>
                {!t.protestado && t.faixa === 'v4' && (
                  <button type="button" className="cob-acao cob-acao-perigo" onClick={() => abrir('protestar', { titulo: t })}>Protestar</button>
                )}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
