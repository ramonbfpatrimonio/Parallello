import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp, ArrowDown, ArrowUpDown, FileSpreadsheet, FileText, Printer,
  SlidersHorizontal, ChevronUp, Loader2, GripHorizontal
} from 'lucide-react';

// Cabeçalho de coluna ordenável (crescente → decrescente)
export function Th({ titulo, campo, ordem, onOrdenar, num, className = '', title }) {
  const ativo = ordem?.campo === campo;
  return (
    <th className={`ord ${num ? 'num' : ''} ${ativo ? 'ativo' : ''} ${className}`} onClick={() => onOrdenar(campo)} title={title || 'Clique para ordenar'}>
      <span className="th-in">
        {titulo}
        {ativo ? (ordem.desc ? <ArrowDown size={13} /> : <ArrowUp size={13} />) : <ArrowUpDown size={12} className="th-ico" />}
      </span>
    </th>
  );
}

// Cabeçalho da página: título à esquerda, ações e botão de recolher filtros no canto superior direito
export function CabecalhoPagina({ titulo, subtitulo, voltar, acoes, filtrosAbertos, onAlternarFiltros }) {
  return (
    <header className="pg-cab">
      <div className="pg-titulo">
        {voltar}
        <h1>{titulo}</h1>
        {subtitulo && <p>{subtitulo}</p>}
      </div>
      <div className="pg-acoes">
        {acoes}
        {onAlternarFiltros && (
          <button className={`btn-icone ${filtrosAbertos ? '' : 'ativo'}`} onClick={onAlternarFiltros}
            title={filtrosAbertos ? 'Recolher filtros' : 'Mostrar filtros'}>
            {filtrosAbertos ? <ChevronUp size={18} /> : <SlidersHorizontal size={18} />}
          </button>
        )}
      </div>
    </header>
  );
}

// Área que recolhe com animação
export function Recolhivel({ aberto, children }) {
  return (
    <div className={`recolhivel ${aberto ? '' : 'fechado'}`} aria-hidden={!aberto}>
      <div className="recolhivel-in">{children}</div>
    </div>
  );
}

// Botões Excel | PDF | Imprimir
export function BotoesExportar({ onExcel, onPdf, onImprimir, desabilitado }) {
  const [ocupado, setOcupado] = useState('');
  const rodar = (tipo, fn) => async () => {
    if (!fn || ocupado) return;
    setOcupado(tipo);
    try { await fn(); } finally { setOcupado(''); }
  };
  const Ico = ({ tipo, Icone }) => (ocupado === tipo ? <Loader2 size={15} className="gira" /> : <Icone size={15} />);
  return (
    <div className="grupo-botoes">
      {onExcel && <button className="btn" disabled={desabilitado} onClick={rodar('x', onExcel)}><Ico tipo="x" Icone={FileSpreadsheet} />Excel</button>}
      {onPdf && <button className="btn" disabled={desabilitado} onClick={rodar('p', onPdf)}><Ico tipo="p" Icone={FileText} />PDF</button>}
      {onImprimir && <button className="btn" disabled={desabilitado} onClick={rodar('i', onImprimir)}><Ico tipo="i" Icone={Printer} />Imprimir</button>}
    </div>
  );
}

// Divide a página: o topo (filtros/indicadores) encolhe quando a alça é puxada para cima,
// aumentando a planilha. Duplo clique na alça alterna entre planilha maximizada e normal.
export function AreaDividida({ topo, children, chave }) {
  const ref = useRef(null);
  const [altura, setAltura] = useState(null); // null = altura natural
  const [arrastando, setArrastando] = useState(false);

  useEffect(() => { setAltura(null); }, [chave]);

  const iniciar = (e) => {
    e.preventDefault();
    const el = ref.current;
    if (!el) return;
    const y0 = e.clientY;
    const h0 = el.getBoundingClientRect().height;
    const natural = el.scrollHeight;
    setArrastando(true);
    const mover = (ev) => {
      const h = Math.max(0, Math.min(natural, h0 + (ev.clientY - y0)));
      setAltura(h);
    };
    const soltar = (ev) => {
      setArrastando(false);
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
      const h = Math.max(0, Math.min(natural, h0 + (ev.clientY - y0)));
      setAltura(h >= natural - 4 ? null : h < 24 ? 0 : h);
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  };

  const alternar = () => setAltura((a) => (a === 0 ? null : 0));
  const maximizado = altura === 0;

  return (
    <div className={`dividida ${arrastando ? 'arrastando' : ''}`}>
      <div ref={ref} className="dividida-topo" style={altura === null ? undefined : { height: altura }}>
        {topo}
      </div>
      <div className="alca" onMouseDown={iniciar} onDoubleClick={alternar}
        title="Arraste para cima para ampliar a planilha · duplo clique alterna">
        <GripHorizontal size={16} />
        <span>{maximizado ? 'Planilha ampliada — arraste para baixo ou dê duplo clique para restaurar' : ''}</span>
      </div>
      <div className="dividida-corpo">{children}</div>
    </div>
  );
}

export function Vazio({ icone: Icone, titulo, texto }) {
  return (
    <div className="vazio-bloco">
      {Icone && <div className="vazio-ico"><Icone size={26} /></div>}
      <b>{titulo}</b>
      {texto && <p>{texto}</p>}
    </div>
  );
}
