import { moeda, numero } from '../lib/calc';

// Faixa de resumo: o custo total em destaque, os demais números ao lado
export default function Resumo({ r, casas, soSemCusto, aoFiltrarSemCusto }) {
  return (
    <div className="resumo">
      <div className="resumo-principal">
        <span>Custo total</span>
        <strong>{moeda(r.custo)}</strong>
      </div>
      <dl className="resumo-itens">
        <div><dt>Produzido</dt><dd>{numero(r.kg, 3)} <small>kg</small></dd></div>
        <div><dt>Custo médio</dt><dd>R$ {numero(r.custoKg, casas)} <small>/kg</small></dd></div>
        <div><dt>Ordens</dt><dd>{r.ordens} <small>com {r.insumos} insumos</small></dd></div>
        <div className={r.semCusto ? 'tem-alerta' : ''}>
          <dt>Insumos sem custo</dt>
          <dd>
            {r.semCusto}
            {aoFiltrarSemCusto && (r.semCusto > 0 || soSemCusto) && (
              <button className="link" onClick={aoFiltrarSemCusto}>{soSemCusto ? 'Mostrar todas' : 'Ver essas ordens'}</button>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
