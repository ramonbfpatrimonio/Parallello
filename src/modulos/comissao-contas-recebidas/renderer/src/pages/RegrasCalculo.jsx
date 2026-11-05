import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Icone from '../components/Icone.jsx';
import { useToast } from '../components/Toast.jsx';

const OPCOES = [
  {
    chave: 'somarST',
    titulo: 'Somar ICMS ST (Substituição Tributária)',
    sim: 'O ICMS-ST entra em tudo: “Total dos pedidos”, valor e comissão dos itens, e o “Recebido” fica como está no banco (com ST). “Total recebido” e comissão a pagar incluem o ST.',
    nao: 'O ICMS-ST sai de tudo: “Total dos pedidos” e itens sem ST, e de cada parcela recebida sai o ST proporcional: valor da parcela × (ST do pedido ÷ total do pedido com ST). Ex.: ST R$ 14,90 em pedido de R$ 163,90 (9,091%) → parcela de R$ 54,63 desconta R$ 4,97. “Total recebido” e comissão a pagar ficam sem ST.'
  }
];

export default function RegrasCalculo({ visivel }) {
  const avisar = useToast();
  const [regras, setRegras] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (visivel) api.regras.obter().then(setRegras).catch((e) => avisar(e.message, 'erro'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel]);

  const alternar = async (chave) => {
    const nova = { ...regras, [chave]: !regras[chave] };
    setRegras(nova);
    setSalvando(true);
    try {
      setRegras(await api.regras.salvar(nova));
      avisar('Regra salva. Clique em “Buscar dados” no relatório para recalcular.');
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
          <h1>Regras de cálculo</h1>
          <p>Definem a base da comissão e do “Total dos pedidos”. Valem para todos os relatórios gerados neste computador.</p>
        </div>
      </header>

      {regras && (
        <div className="regras">
          {OPCOES.map((o) => {
            const ligado = regras[o.chave];
            return (
              <label key={o.chave} className={'cartao regra' + (ligado ? ' ligada' : '')}>
                <div className="regra-topo">
                  <div>
                    <h3>{o.titulo}</h3>
                    <span className={'selo' + (ligado ? '' : ' alerta')}>{ligado ? 'Ligada' : 'Desligada'}</span>
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
          As devoluções são sempre descontadas (igual à planilha). A comissão da parcela é <b>valor recebido × %</b>, onde{' '}
          <b>% = comissão dos itens ÷ valor dos itens</b>. Os fechamentos já salvos não mudam — cada um guarda as regras com que foi gerado.
        </span>
      </div>
    </div>
  );
}
