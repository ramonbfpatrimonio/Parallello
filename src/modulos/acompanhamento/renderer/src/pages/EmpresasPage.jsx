import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save, PlugZap, ArrowUp, ArrowDown, Building2, Database } from 'lucide-react';
import { Toggle, Aviso } from '../components/Comuns.jsx';
import { limparErro } from './ReportPage.jsx';

const BASE_NOVA = () => ({
  id: '',
  nome: '',
  servidor: '',
  porta: '',
  instancia: '',
  banco: '',
  usuario: '',
  novaSenha: '',
  ativa: true,
  criptografar: false,
  timeoutSeg: 180
});

export default function EmpresasPage({ dados, setDados, avisar }) {
  const [selId, setSelId] = useState(dados.empresaAtivaId);
  const original = dados.empresas.find((e) => e.id === selId) || dados.empresas[0];
  const [form, setForm] = useState(original);
  const [testes, setTestes] = useState({});
  const [alterado, setAlterado] = useState(false);

  useEffect(() => {
    const e = dados.empresas.find((x) => x.id === selId) || dados.empresas[0];
    setForm(e ? JSON.parse(JSON.stringify(e)) : null);
    setTestes({});
    setAlterado(false);
  }, [selId, dados]);

  const mudar = (patch) => { setForm({ ...form, ...patch }); setAlterado(true); };
  const mudarBase = (i, patch) => {
    const bases = form.bases.map((b, j) => (j === i ? { ...b, ...patch } : b));
    mudar({ bases });
  };
  const mudarFab = (i, patch) => mudar({ fabricantes: form.fabricantes.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const moverFab = (i, d) => {
    const l = [...form.fabricantes];
    const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    mudar({ fabricantes: l });
  };

  const salvar = async () => {
    try {
      const novos = await window.api.salvarEmpresa(form);
      setDados(novos);
      avisar('Empresa salva.');
    } catch (err) {
      avisar(limparErro(err), 'erro');
    }
  };

  const testar = async (i) => {
    const b = form.bases[i];
    setTestes({ ...testes, [i]: { testando: true } });
    const r = await window.api.testarBase({ empresaId: form.id, base: b });
    setTestes((t) => ({ ...t, [i]: r }));
  };

  const nova = async () => {
    const nome = 'Nova empresa';
    const novos = await window.api.novaEmpresa(nome);
    setDados(novos);
    setSelId(novos.empresaAtivaId);
  };

  const excluir = async () => {
    if (!window.confirm(`Excluir a empresa "${form.nome}" com todas as conexões? Esta ação não pode ser desfeita.`)) return;
    const novos = await window.api.excluirEmpresa(form.id);
    setDados(novos);
    setSelId(novos.empresaAtivaId);
  };

  if (!form) {
    return (
      <div className="card vazio">
        <Building2 size={30} />
        <b>Nenhuma empresa cadastrada</b>
        <button className="btn primario" style={{ marginTop: 12 }} onClick={nova}><Plus size={16} /> Cadastrar empresa</button>
      </div>
    );
  }

  return (
    <div className="duas-colunas">
      <div className="card">
        <div className="lista">
          {dados.empresas.map((e) => (
            <button key={e.id} className={e.id === form.id ? 'ativo' : ''} onClick={() => setSelId(e.id)}>
              <span>
                <b style={{ display: 'block' }}>{e.nome}</b>
                <small>{e.bases.length} base(s){e.id === dados.empresaAtivaId ? ' • em uso' : ''}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="card-corpo">
          <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={nova}><Plus size={16} /> Nova empresa</button>
        </div>
      </div>

      <div className="card card-corpo">
        <div className="secao-topo">
          <h3>Dados da empresa</h3>
          <div className="acoes">
            {alterado && <span className="selo">alterações não salvas</span>}
            <button className="btn perigo" onClick={excluir} disabled={dados.empresas.length <= 1}><Trash2 size={15} /> Excluir</button>
            <button className="btn primario" onClick={salvar}><Save size={15} /> Salvar</button>
          </div>
        </div>
        <div className="grade">
          <label className="campo campo-largo"><span>Nome da empresa (cliente)</span>
            <input className="input" value={form.nome} onChange={(e) => mudar({ nome: e.target.value })} />
          </label>
          <label className="campo"><span title="Usado no relatório Acompanhamento diário">Dígitos de supervisão</span>
            <input className="input" value={form.prefixosSupervisao || ''} placeholder="1,2,3,4,5" onChange={(e) => mudar({ prefixosSupervisao: e.target.value })} />
          </label>
        </div>
        <p className="ajuda">No Acompanhamento diário, só entram setores que começam com esses dígitos (na planilha: 1 a 5). Deixe vazio para considerar todos.</p>

        <div className="secao">
          <div className="secao-topo">
            <h3><Database size={15} style={{ verticalAlign: -2 }} /> Bases de dados (SQL Server)</h3>
          </div>
          <p className="ajuda" style={{ marginBottom: 10 }}>
            As bases são as conexões do Parallello (as mesmas de todos os sistemas). Para incluir ou alterar,
            use a configuração do Parallello: <b>Ctrl+Shift+B</b> na tela inicial. Os relatórios consultam todas e somam o resultado.
          </p>
          {!form.bases.length && <Aviso tipo="info">Nenhuma conexão cadastrada no Parallello para esta empresa.</Aviso>}
          {form.bases.map((b, i) => {
            const t = testes[i];
            return (
              <div className="base" key={b.id || 'n' + i}>
                <div className="base-topo">
                  <b className="base-nome">{b.nome || b.banco}</b>
                  <span className="ajuda">{b.servidor}{b.instancia ? '\\' + b.instancia : ''}{b.porta ? ',' + b.porta : ''} · {b.banco}{b.temSenha ? '' : ' · sem senha neste computador'}</span>
                  {t && !t.testando && (t.ok
                    ? <span className="selo ok">Conectado • {Number(t.prevendas).toLocaleString('pt-BR')} pré-vendas</span>
                    : <span className="selo bad">Falhou</span>)}
                  <button className="btn mini" onClick={() => testar(i)} disabled={t && t.testando}>
                    <PlugZap size={14} /> {t && t.testando ? 'Testando...' : 'Testar conexão'}
                  </button>
                </div>
                {t && !t.testando && !t.ok && <div style={{ marginTop: 10 }}><Aviso tipo="erro">{t.erro}</Aviso></div>}
              </div>
            );
          })}
        </div>

        <div className="secao">
          <div className="secao-topo">
            <h3>Fabricantes (colunas dos relatórios)</h3>
            <button className="btn" onClick={() => mudar({ fabricantes: [...form.fabricantes, { nome: '', ativo: true }] })}><Plus size={15} /> Adicionar</button>
          </div>
          <p className="ajuda" style={{ marginBottom: 10 }}>O nome deve ser igual ao cadastro de Fabricantes do ERP (maiúsculas e espaços não importam). A ordem aqui é a ordem das colunas.</p>
          <div className="fabs">
            {form.fabricantes.map((f, i) => (
              <div className="fab" key={i}>
                <input className="input" value={f.nome} onChange={(e) => mudarFab(i, { nome: e.target.value })} />
                <Toggle checked={f.ativo !== false} onChange={(v) => mudarFab(i, { ativo: v })}>Mostrar</Toggle>
                <button className="btn mini fantasma" onClick={() => moverFab(i, -1)} title="Subir"><ArrowUp size={14} /></button>
                <button className="btn mini fantasma" onClick={() => moverFab(i, 1)} title="Descer"><ArrowDown size={14} /></button>
                <button className="btn mini fantasma perigo" onClick={() => mudar({ fabricantes: form.fabricantes.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Toggle checked={form.agruparOutros} onChange={(v) => mudar({ agruparOutros: v })}>
              Somar os demais fabricantes numa coluna “Outros” (a planilha descartava)
            </Toggle>
          </div>
        </div>
      </div>
    </div>
  );
}
