// Cobrança no Parallello: liga a tela do módulo ao processo principal.
// A nuvem e o ERP chegam pela ponte (window.api); a empresa é sempre a do usuário logado.
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CobrancaModulo from './CobrancaModulo.jsx';
import './parallello.css';

const chamar = (...a) => window.api.chamar(...a);

const METODOS_NUVEM = [
  'carregarConfig', 'salvarConfig', 'listarOperadores', 'salvarOperador', 'excluirOperador', 'entrarComPin',
  'ultimosRegistrosPorDoc', 'ultimosRegistrosPorCliente', 'jaRegistradoHoje', 'inserirRegistro', 'atualizarRegistro',
  'registrosDoDia', 'registrosDoPeriodo', 'registrosDoCliente', 'registrosPendentesErp', 'marcarPagos',
  'documentosCobradosPagos', 'inserirEventos', 'eventosDoCliente', 'eventosDoLote', 'whatsappPorCliente', 'ultimoEmailPorCliente',
];
export function criarNuvemIpc(empresaId) {
  const n = { empresaId };
  for (const m of METODOS_NUVEM) n[m] = (...args) => chamar('nuvem', m, ...args);
  return n;
}

const METODOS_ERP = ['carregar', 'carteiraCliente', 'cobradoRecebido', 'historicoErp', 'gravarHistorico', 'protestar',
  'enviarEmail', 'testarSmtp', 'abrirExterno', 'copiar', 'exportar'];
export function criarErpIpc() {
  const e = { definirConexao: async () => true }; // a conexão é a escolhida no Parallello
  for (const m of METODOS_ERP) e[m] = (...args) => chamar(`erp:${m}`, ...args);
  return e;
}

function Raiz() {
  const [sessao, setSessao] = useState(null);
  const [erro, setErro] = useState('');
  const [conexoes, setConexoes] = useState([]);
  const [versao, setVersao] = useState(0); // troca de conexão: recarrega a tela

  useEffect(() => {
    chamar('sessao:info').then(setSessao).catch((e) => setErro(e.message));
    chamar('conexoes:listar').then(setConexoes).catch(() => {});
  }, []);

  const nuvem = useMemo(() => (sessao?.empresaId ? criarNuvemIpc(sessao.empresaId) : null), [sessao]);
  const erp = useMemo(() => criarErpIpc(), []);

  const trocarConexao = async (id) => {
    await chamar('conexoes:escolher', id);
    setConexoes(await chamar('conexoes:listar'));
    setVersao((v) => v + 1);
  };

  if (erro) return <div className="pl-cob-aviso">{erro}</div>;
  if (!sessao) return null;
  if (!sessao.empresaId) return <div className="pl-cob-aviso">Escolha a empresa no Parallello antes de abrir a Cobrança.</div>;

  return (
    <div className={`pl-cob${conexoes.length > 1 ? " com-barra" : ""}`}>
      {conexoes.length > 1 && (
        <div className="pl-cob-barra">
          <span>Conexão</span>
          <select value={conexoes.find((c) => c.ativa)?.id || ''} onChange={(e) => trocarConexao(e.target.value)}>
            {conexoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      )}
      <div className="pl-cob-corpo">
        <CobrancaModulo
          key={versao}
          nuvem={nuvem}
          erp={erp}
          empresaId={sessao.empresaId}
          usuario={sessao.usuario}
          verificarSenhaParallello={(s) => chamar('sistema:liberar', s).catch(() => false)}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Raiz />);
