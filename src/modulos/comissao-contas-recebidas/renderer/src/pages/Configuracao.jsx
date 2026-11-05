import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { parseNumero, paraCampo } from '../fmt.js';
import Icone from '../components/Icone.jsx';
import SeletorConexao from '../components/SeletorConexao.jsx';
import TabelaArrastavel from '../components/TabelaArrastavel.jsx';
import Modal, { Confirmar } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';

const UFS = 'AC,AL,AM,AP,BA,CE,DF,ES,GO,MA,MG,MS,MT,PA,PB,PE,PI,PR,RJ,RN,RO,RR,RS,SC,SE,SP,TO'.split(',');
const TIPOS = ['Todas', 'Cidade 001', 'Outras Cidades'];
let seq = 0;
const novaChave = () => 'l' + ++seq;

export default function Configuracao({ conexoes, conexaoId, setConexaoId, podeGravar = false }) {
  const avisar = useToast();
  const [uf, setUf] = useState('AM');
  const [tipo, setTipo] = useState('Todas');
  const [linhas, setLinhas] = useState([]);
  const [carregadoPara, setCarregadoPara] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [fabricantes, setFabricantes] = useState([]);
  const [previa, setPrevia] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState(null);

  const conexaoNome = conexoes.find((c) => c.id === conexaoId)?.nome || '';

  useEffect(() => {
    setFabricantes([]);
    setLinhas([]);
    setCarregadoPara(null);
    if (conexaoId) api.fabricantes(conexaoId).then(setFabricantes).catch(() => {});
  }, [conexaoId]);

  const mapaFab = useMemo(() => {
    const m = new Map();
    for (const f of fabricantes) {
      m.set(f.codigo, f);
      if (/^\d+$/.test(f.codigo)) m.set('#' + parseInt(f.codigo, 10), f);
    }
    return m;
  }, [fabricantes]);

  const acharFab = (cod) => {
    const c = String(cod || '').trim();
    if (!c) return null;
    return mapaFab.get(c) || (/^\d+$/.test(c) ? mapaFab.get('#' + parseInt(c, 10)) : null);
  };

  const carregar = async () => {
    setCarregando(true);
    try {
      const r = await api.comissoes.carregar(conexaoId, { uf, tipoCidade: tipo });
      setLinhas(
        r.map((x) => ({
          chave: novaChave(),
          codigo: x.codigo,
          nome: x.nome,
          p001: paraCampo(x.p001),
          pOutras: paraCampo(x.pOutras),
          pTel: paraCampo(x.pTel),
          pDesc: paraCampo(x.pDesc),
          outrasVariam: x.outrasVariam,
          salvo: true,
          sujo: false
        }))
      );
      setCarregadoPara({ uf, tipo, conexaoId });
      if (!r.length) avisar(`Nenhuma comissão cadastrada para ${uf} (${tipo}).`, 'info');
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setCarregando(false);
    }
  };

  const alterar = (chave, campo, valor) =>
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.chave !== chave) return l;
        const n = { ...l, [campo]: valor, sujo: true };
        if (campo === 'codigo') {
          const f = acharFab(valor);
          n.nome = valor.trim() ? (f ? f.nome : 'Não cadastrado') : '';
        }
        return n;
      })
    );

  const normalizarCodigo = (chave) =>
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.chave !== chave) return l;
        const f = acharFab(l.codigo);
        return f ? { ...l, codigo: f.codigo, nome: f.nome } : l;
      })
    );

  const adicionar = () =>
    setLinhas((ls) => [...ls, { chave: novaChave(), codigo: '', nome: '', p001: '', pOutras: '', pTel: '0', pDesc: '0', salvo: false, sujo: true }]);

  const validar = () => {
    const vistos = new Set();
    for (const l of linhas) {
      const c = l.codigo.trim();
      if (!c) return 'Há linha sem código de fabricante.';
      if (!acharFab(c) && fabricantes.length) return `Fabricante ${c} não está cadastrado no ERP.`;
      if (vistos.has(c)) return `O fabricante ${c} aparece mais de uma vez.`;
      vistos.add(c);
      for (const k of ['p001', 'pOutras', 'pTel', 'pDesc']) {
        const n = parseNumero(l[k]);
        if (isNaN(n) || n < 0 || n > 100) return `Percentual inválido no fabricante ${c}.`;
      }
    }
    return null;
  };

  const payload = () => ({
    uf,
    tipoCidade: tipo,
    linhas: linhas.map((l) => ({ codigo: l.codigo.trim(), p001: parseNumero(l.p001), pOutras: parseNumero(l.pOutras), pTel: parseNumero(l.pTel), pDesc: parseNumero(l.pDesc) }))
  });

  const prepararSalvar = async () => {
    const erro = validar();
    if (erro) return avisar(erro, 'erro');
    if (!linhas.length) return avisar('Nenhum fabricante na tabela.', 'erro');
    setSalvando(true);
    try {
      const r = await api.comissoes.previa(conexaoId, payload());
      setPrevia(r);
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const confirmarSalvar = async () => {
    setSalvando(true);
    try {
      const r = await api.comissoes.salvar(conexaoId, payload());
      setPrevia(null);
      avisar(`Comissões salvas no banco ${conexaoNome}: ${r.atualizadas} linhas atualizadas e ${r.inseridas} inseridas.`);
      await carregar();
    } catch (e) {
      avisar('Nada foi alterado no banco. ' + e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const pedirExclusao = async (l) => {
    if (!l.salvo) {
      setLinhas((ls) => ls.filter((x) => x.chave !== l.chave));
      return;
    }
    try {
      const [p] = await api.comissoes.previa(conexaoId, { uf, tipoCidade: tipo, codigo: l.codigo });
      setExcluir({ linha: l, qtd: p ? p.atualizar : 0 });
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const confirmarExclusao = async () => {
    setSalvando(true);
    try {
      const r = await api.comissoes.excluir(conexaoId, { uf, tipoCidade: tipo, codigo: excluir.linha.codigo });
      setLinhas((ls) => ls.filter((x) => x.chave !== excluir.linha.chave));
      avisar(`Comissões do fabricante ${excluir.linha.codigo} excluídas (${r.excluidas} linhas) no banco ${conexaoNome}.`);
      setExcluir(null);
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const filtroMudou = carregadoPara && (carregadoPara.uf !== uf || carregadoPara.tipo !== tipo);
  const sujas = linhas.filter((l) => l.sujo).length;
  const desab001 = tipo === 'Outras Cidades';
  const desabOutras = tipo === 'Cidade 001';

  return (
    <div className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Configurar Comissões</h1>
          <p>
            Percentuais por fabricante gravados direto na tabela CidadesComissoes do ERP
            {!podeGravar && ' · Você pode consultar; só administradores gravam ou excluem.'}
          </p>
        </div>
        <div className="acoes">
          <button className="btn" onClick={adicionar} disabled={!carregadoPara}>
            <Icone nome="mais" /> Adicionar fabricante
          </button>
          <button className="btn primario" onClick={prepararSalvar} disabled={!podeGravar || !linhas.length || salvando} title={podeGravar ? '' : 'Somente administradores gravam no ERP'}>
            <Icone nome="salvar" /> Salvar no banco{sujas ? ` (${sujas})` : ''}
          </button>
        </div>
      </header>

      <section className="cartao filtros">
        <SeletorConexao conexoes={conexoes} valor={conexaoId} aoMudar={setConexaoId} rotulo="Banco" />
        <label className="campo curto">
          <span>UF</span>
          <select value={uf} onChange={(e) => setUf(e.target.value)}>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Tipo de cidade</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <button className="btn primario grande" onClick={carregar} disabled={carregando || !conexaoId}>
          <Icone nome="atualizar" className={carregando ? 'girando' : ''} /> {carregando ? 'Carregando…' : 'Carregar do banco'}
        </button>
      </section>

      {filtroMudou && (
        <div className="aviso">
          <Icone nome="alerta" />
          A tabela foi carregada para <b>{carregadoPara.uf} / {carregadoPara.tipo}</b>. Ao salvar agora, estes percentuais serão gravados em <b>{uf} / {tipo}</b>.
        </div>
      )}

      {carregadoPara ? (
        <TabelaArrastavel>
          <table className="tabela editavel">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Cód. Fab.</th>
                <th>Fabricante</th>
                <th className="n" style={{ width: 140 }}>% Cidade 001</th>
                <th className="n" style={{ width: 150 }}>% Outras cidades</th>
                <th className="n" style={{ width: 120 }}>% Tel. Op.</th>
                <th className="n" style={{ width: 120 }}>% Desconto</th>
                <th style={{ width: 56 }} />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.chave} className={l.sujo ? 'sujo' : ''}>
                  <td>
                    <input
                      list="lista-fabricantes"
                      value={l.codigo}
                      onChange={(e) => alterar(l.chave, 'codigo', e.target.value)}
                      onBlur={() => normalizarCodigo(l.chave)}
                      disabled={l.salvo}
                      className="mono"
                      placeholder="Código"
                    />
                  </td>
                  <td className={l.nome === 'Não cadastrado' ? 'texto-erro' : ''}>{l.nome}</td>
                  <td className="n">
                    <CampoPct valor={l.p001} desab={desab001} aoMudar={(v) => alterar(l.chave, 'p001', v)} />
                  </td>
                  <td className="n">
                    <div className="pct-com-alerta">
                      {l.outrasVariam && !l.sujo && (
                        <span className="alerta-mini" title="As outras cidades desta UF têm percentuais diferentes entre si; aqui aparece o maior. Ao salvar, todas ficam com este valor.">
                          <Icone nome="alerta" tamanho={14} />
                        </span>
                      )}
                      <CampoPct valor={l.pOutras} desab={desabOutras} aoMudar={(v) => alterar(l.chave, 'pOutras', v)} />
                    </div>
                  </td>
                  <td className="n">
                    <CampoPct valor={l.pTel} aoMudar={(v) => alterar(l.chave, 'pTel', v)} />
                  </td>
                  <td className="n">
                    <CampoPct valor={l.pDesc} aoMudar={(v) => alterar(l.chave, 'pDesc', v)} />
                  </td>
                  <td>
                    <button className="btn-icone perigo" title={l.salvo ? 'Excluir do banco' : 'Remover linha'} onClick={() => pedirExclusao(l)} disabled={l.salvo && !podeGravar}>
                      <Icone nome="lixo" tamanho={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {!linhas.length && (
                <tr>
                  <td colSpan={7} className="vazio">
                    Nenhum fabricante. Use “Adicionar fabricante”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <datalist id="lista-fabricantes">
            {fabricantes.map((f) => (
              <option key={f.codigo} value={f.codigo}>
                {f.nome}
              </option>
            ))}
          </datalist>
        </TabelaArrastavel>
      ) : (
        <div className="vazio-grande">
          <Icone nome="config" tamanho={40} />
          <h3>Escolha a UF e o tipo de cidade e clique em “Carregar do banco”</h3>
          <p>“Cidade 001” é a cidade de código 001 da UF; “Outras Cidades” são as demais.</p>
        </div>
      )}

      {previa && (
        <Modal
          titulo="Confirmar gravação no banco"
          largura={600}
          aoFechar={salvando ? null : () => setPrevia(null)}
          rodape={
            <>
              <button className="btn" onClick={() => setPrevia(null)} disabled={salvando}>Cancelar</button>
              <button className="btn primario" onClick={confirmarSalvar} disabled={salvando}>
                {salvando ? 'Gravando…' : 'Gravar no banco'}
              </button>
            </>
          }
        >
          <p>
            Banco <b>{conexaoNome}</b> — UF <b>{uf}</b> — <b>{tipo}</b>. Tudo é gravado de uma vez: se der erro, nada é alterado.
          </p>
          <div className="tabela-wrap baixa">
            <table className="tabela compacta">
              <thead>
                <tr>
                  <th>Fabricante</th>
                  <th className="n">Cidades atualizadas</th>
                  <th className="n">Cidades novas</th>
                </tr>
              </thead>
              <tbody>
                {previa.map((p) => (
                  <tr key={p.codigo}>
                    <td>
                      {p.codigo} — {acharFab(p.codigo)?.nome || ''}
                    </td>
                    <td className="n">{p.atualizar}</td>
                    <td className="n">{p.inserir}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>TOTAL</td>
                  <td className="n">{previa.reduce((s, p) => s + p.atualizar, 0)}</td>
                  <td className="n">{previa.reduce((s, p) => s + p.inserir, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Modal>
      )}

      {excluir && (
        <Confirmar
          titulo="Excluir comissões do fabricante"
          perigo
          ocupado={salvando}
          textoOk="Excluir do banco"
          mensagem={
            <p>
              Excluir as comissões do fabricante <b>{excluir.linha.codigo} — {excluir.linha.nome}</b> na UF <b>{uf}</b> ({tipo}) do banco{' '}
              <b>{conexaoNome}</b>? Serão removidas <b>{excluir.qtd}</b> linhas da tabela CidadesComissoes.
            </p>
          }
          aoConfirmar={confirmarExclusao}
          aoFechar={() => setExcluir(null)}
        />
      )}
    </div>
  );
}

function CampoPct({ valor, aoMudar, desab }) {
  const invalido = valor !== '' && (isNaN(parseNumero(valor)) || parseNumero(valor) < 0 || parseNumero(valor) > 100);
  return (
    <input
      className={'pct' + (invalido ? ' invalido' : '')}
      inputMode="decimal"
      value={valor}
      disabled={desab}
      onChange={(e) => aoMudar(e.target.value)}
      onFocus={(e) => e.target.select()}
    />
  );
}
