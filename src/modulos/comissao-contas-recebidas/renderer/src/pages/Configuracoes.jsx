import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Icone from '../components/Icone.jsx';
import { useToast } from '../components/Toast.jsx';

// Configurações do cálculo (área de sistema — Ctrl+Shift+B)
const PADRAO = { totalComST: false, recebidoComST: true, somaPorBaixa: true };

const OPCOES = [
  {
    chave: 'totalComST',
    titulo: 'Total pedido com ST',
    sim: 'A coluna “Total pedido” (e o card “Total dos pedidos”) soma o ICMS-ST do pedido, e o “Valor item” dos itens com ST também passa a incluir o ST. A comissão do item continua sobre o valor sem ST.',
    nao: 'A coluna “Total pedido” fica sem ICMS-ST: itens − devoluções (como no Ativo).'
  },
  {
    chave: 'recebidoComST',
    titulo: 'Recebido com ST',
    sim: 'A coluna “Recebido” fica como está no banco (com o ST que o cliente pagou), como na planilha.',
    nao: 'Da coluna “Recebido” sai o ST proporcional da parcela: parcela × (ST do pedido ÷ total do pedido com ST). Ex.: ST 14,90 em pedido de 163,90 → parcela 54,63 desconta 4,97.'
  },
  {
    chave: 'somaPorBaixa',
    titulo: 'Total pedido somado por baixa',
    sim: 'O card e a linha TOTAL somam o “Total pedido” em cada baixa: pedido pago em 2 parcelas entra 2 vezes (como a planilha).',
    nao: 'O card e a linha TOTAL somam o “Total pedido” de cada pedido uma vez só, mesmo com várias parcelas.',
    rotulos: ['Por baixa', 'Por pedido']
  }
];

export default function Configuracoes({ visivel }) {
  const avisar = useToast();
  const [cfg, setCfg] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (visivel)
      api.config
        .obter('colunasST', PADRAO)
        .then((c) => setCfg({ ...PADRAO, ...(c || {}) }))
        .catch((e) => avisar(e.message, 'erro'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel]);

  const alternar = async (chave) => {
    const novo = { ...cfg, [chave]: !cfg[chave] };
    setCfg(novo);
    setSalvando(true);
    try {
      await api.config.definir('colunasST', novo);
      avisar('Configuração salva. Clique em “Buscar dados” no relatório para recalcular.');
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Configurações</h1>
          <p>ICMS-ST nas colunas e soma do Total pedido. Vale para os próximos relatórios gerados neste computador.</p>
        </div>
      </header>

      {cfg && (
        <div className="opcoes">
          {OPCOES.map((o) => {
            const ligado = !!cfg[o.chave];
            return (
              <label key={o.chave} className={'cartao opcao' + (ligado ? ' ligada' : '')}>
                <div className="opcao-topo">
                  <div>
                    <h3>{o.titulo}</h3>
                    <span className={'selo' + (ligado ? '' : ' alerta')}>{(o.rotulos || ['Com ST', 'Sem ST'])[ligado ? 0 : 1]}</span>
                  </div>
                  <span className="chave">
                    <input type="checkbox" checked={ligado} disabled={salvando} onChange={() => alternar(o.chave)} />
                    <span className="trilho" />
                  </span>
                </div>
                <p>{ligado ? o.sim : o.nao}</p>
              </label>
            );
          })}
        </div>
      )}

      <div className="dica">
        <Icone nome="alerta" tamanho={16} />
        <span>
          <b>Comissão</b> da parcela = Recebido × (comissão dos itens ÷ Total pedido), sem arredondar a proporção (igual ao Ativo). <b>% Com.</b> mostra essa proporção com 2 casas. Os fechamentos já salvos
          não mudam.
        </span>
      </div>
    </div>
  );
}
