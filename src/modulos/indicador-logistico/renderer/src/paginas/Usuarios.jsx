import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDataHora } from '../lib/formato';
import { useAviso, Modal, Confirmar } from '../componentes/comum';

const VAZIO = { nome: '', usuario: '', perfil: 'operador', senha: '', ativo: true };

export default function Usuarios({ sessao }) {
  const avisar = useAviso();
  const [lista, setLista] = useState(null);
  const [form, setForm] = useState(null);
  const [excluir, setExcluir] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => api('usuarios:listar').then(setLista).catch((e) => avisar(e.message, 'erro'));
  useEffect(() => { carregar(); }, []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function salvar() {
    setSalvando(true);
    try { await api('usuarios:salvar', form); setForm(null); carregar(); avisar('Usuário salvo.', 'ok'); } catch (e) { avisar(e.message, 'erro'); } finally { setSalvando(false); }
  }

  async function confirmarExclusao() {
    try { await api('usuarios:excluir', { id: excluir.id }); setExcluir(null); carregar(); } catch (e) { avisar(e.message, 'erro'); }
  }

  return (
    <div className="pagina" style={{ maxWidth: 1100 }}>
      <div className="pagina-topo">
        <div><h1>Usuários</h1><p>Administrador acessa tudo. Operador consulta o painel, o histórico e exporta.</p></div>
        <button className="btn primario" onClick={() => setForm({ ...VAZIO })}><Plus size={16} /> Novo usuário</button>
      </div>
      <div className="card">
        {!lista ? <div className="vazio"><Loader2 className="girar" /></div> : !lista.length ? (
          <div className="vazio"><Users size={34} /><p>Nenhum usuário cadastrado. Crie pelo menos um administrador.</p></div>
        ) : (
          <table className="tabela">
            <thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Criado em</th><th></th></tr></thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.nome}</b></td>
                  <td className="mono">{u.usuario}</td>
                  <td><span className={`pilula ${u.perfil === 'admin' ? 'destaque' : 'neutra'}`}>{u.perfil === 'admin' ? 'Administrador' : 'Operador'}</span></td>
                  <td>{u.ativo ? <span className="pilula ok">Ativo</span> : <span className="pilula neutra">Inativo</span>}</td>
                  <td className="sub">{fmtDataHora(u.criadoEm)}</td>
                  <td className="dir">
                    <button className="btn fantasma icone" onClick={() => setForm({ ...u, senha: '' })} title="Editar"><Pencil size={15} /></button>
                    {u.id !== sessao.id && <button className="btn fantasma icone perigo" onClick={() => setExcluir(u)} title="Excluir"><Trash2 size={15} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {form && (
        <Modal titulo={form.id ? 'Editar usuário' : 'Novo usuário'} onFechar={() => setForm(null)} rodape={<>
          <button className="btn" onClick={() => setForm(null)}>Cancelar</button>
          <button className="btn primario" onClick={salvar} disabled={salvando}>{salvando && <Loader2 size={16} className="girar" />} Salvar</button>
        </>}>
          <div className="grade g2">
            <label className="campo" style={{ gridColumn: 'span 2' }}><span>Nome *</span><input value={form.nome} onChange={(e) => set('nome', e.target.value)} autoFocus /></label>
            <label className="campo"><span>Usuário (login) *</span><input value={form.usuario} onChange={(e) => set('usuario', e.target.value.replace(/\s/g, ''))} /></label>
            <label className="campo"><span>Perfil</span>
              <select value={form.perfil} onChange={(e) => set('perfil', e.target.value)}>
                <option value="operador">Operador</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            <label className="campo"><span>{form.id ? 'Nova senha' : 'Senha *'}</span>
              <input type="password" value={form.senha} onChange={(e) => set('senha', e.target.value)} placeholder={form.id ? 'Deixe vazio para manter' : 'Mínimo 4 caracteres'} />
            </label>
            <div className="campo" style={{ justifyContent: 'flex-end' }}>
              <label className="check"><input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Usuário ativo</label>
            </div>
          </div>
        </Modal>
      )}
      {excluir && <Confirmar texto={`Excluir o usuário "${excluir.nome}"?`} onSim={confirmarExclusao} onNao={() => setExcluir(null)} />}
    </div>
  );
}
