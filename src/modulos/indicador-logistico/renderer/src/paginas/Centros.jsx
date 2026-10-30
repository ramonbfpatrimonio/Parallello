import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAviso, Confirmar } from '../componentes/comum';

export default function Centros() {
  const avisar = useAviso();
  const [lista, setLista] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [restaurar, setRestaurar] = useState(false);

  useEffect(() => { api('centros:listar').then(setLista).catch((e) => avisar(e.message, 'erro')); }, []);

  const set = (i, k, v) => setLista((l) => l.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  async function salvar() {
    const codigos = lista.map((c) => String(c.codigo).trim()).filter(Boolean);
    if (new Set(codigos).size !== codigos.length) return avisar('Há códigos repetidos.', 'erro');
    setSalvando(true);
    try { setLista(await api('centros:salvar', { lista })); avisar('Centros de custo salvos.', 'ok'); } catch (e) { avisar(e.message, 'erro'); } finally { setSalvando(false); }
  }

  async function confirmarRestaurar() {
    try { setLista(await api('centros:restaurar')); setRestaurar(false); avisar('Lista padrão restaurada.', 'ok'); } catch (e) { avisar(e.message, 'erro'); }
  }

  if (!lista) return <div className="vazio"><Loader2 className="girar" /></div>;

  return (
    <div className="pagina" style={{ maxWidth: 900 }}>
      <div className="pagina-topo">
        <div><h1>Centros de custo</h1><p>O código é o mesmo do campo CentCusto do ERP (usado no Custo por Entrega).</p></div>
        <div className="acoes">
          <button className="btn" onClick={() => setRestaurar(true)}><RotateCcw size={16} /> Restaurar padrão</button>
          <button className="btn" onClick={() => setLista((l) => [...l, { codigo: '', descricao: '' }])}><Plus size={16} /> Adicionar</button>
          <button className="btn primario" onClick={salvar} disabled={salvando}>{salvando ? <Loader2 size={16} className="girar" /> : <Save size={16} />} Salvar</button>
        </div>
      </div>
      <div className="card centros">
        <table className="tabela">
          <thead><tr><th style={{ width: 120 }}>Código</th><th>Descrição</th><th style={{ width: 50 }}></th></tr></thead>
          <tbody>
            {lista.map((c, i) => (
              <tr key={i}>
                <td><input className="num" value={c.codigo} onChange={(e) => set(i, 'codigo', e.target.value.replace(/[^\w-]/g, ''))} placeholder="Código" /></td>
                <td><input value={c.descricao} onChange={(e) => set(i, 'descricao', e.target.value)} placeholder="Descrição" /></td>
                <td><button className="btn fantasma icone perigo" onClick={() => setLista((l) => l.filter((_, j) => j !== i))} title="Remover"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lista.length && <div className="vazio">Nenhum centro de custo.</div>}
      </div>
      {restaurar && <Confirmar texto="Substituir a lista atual pela lista padrão da planilha?" rotuloSim="Restaurar" onSim={confirmarRestaurar} onNao={() => setRestaurar(false)} />}
    </div>
  );
}
