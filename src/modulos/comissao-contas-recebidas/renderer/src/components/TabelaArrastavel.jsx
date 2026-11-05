import { useCallback, useEffect, useRef, useState } from 'react';

// Área de tabela com puxador: arrastar para cima aumenta a tabela "para cima"
// (a página rola junto, então a parte de baixo fica parada e o topo sobe por cima dos filtros).
// Duplo clique no puxador: maximiza / volta ao tamanho normal.
const MARGEM = 20;
const scroller = () => document.scrollingElement || document.documentElement;

export default function TabelaArrastavel({ cabecalho, children, minimo = 180, className = '' }) {
  const refAlca = useRef(null);
  const refWrap = useRef(null);
  const [altura, setAltura] = useState(null); // null = preenche até o fim da tela
  const [auto, setAuto] = useState(320);
  const [arrastando, setArrastando] = useState(false);

  const calcularAuto = useCallback(() => {
    const el = refWrap.current;
    if (!el || !el.offsetParent) return; // página escondida
    const topoAbs = el.getBoundingClientRect().top + scroller().scrollTop;
    setAuto(Math.max(minimo, Math.round(window.innerHeight - topoAbs - MARGEM)));
  }, [minimo]);

  useEffect(() => {
    calcularAuto();
    const ro = new ResizeObserver(() => calcularAuto());
    if (refAlca.current) ro.observe(refAlca.current);
    window.addEventListener('resize', calcularAuto);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calcularAuto);
    };
  }, [calcularAuto]);

  // espaço entre o puxador e o início da tabela (abas, busca…)
  const alturaCabecalho = () => {
    const a = refAlca.current.getBoundingClientRect();
    const w = refWrap.current.getBoundingClientRect();
    return w.top - a.top;
  };
  const maxima = () => Math.max(minimo, window.innerHeight - alturaCabecalho() - MARGEM);

  const iniciar = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const s = scroller();
    const el = refWrap.current;
    const h0 = el.getBoundingClientRect().height;
    const y0 = e.clientY;
    const sc0 = s.scrollTop;
    const hMax = maxima();
    let h = h0;

    const mover = (ev) => {
      h = Math.round(Math.max(minimo, Math.min(hMax, h0 + (y0 - ev.clientY))));
      el.style.height = h + 'px';
      s.scrollTop = Math.max(0, sc0 + (h - h0));
    };
    const soltar = () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
      document.body.classList.remove('arrastando-y');
      setArrastando(false);
      setAltura(h);
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
    document.body.classList.add('arrastando-y');
    setArrastando(true);
  };

  const alternarMaximo = () => {
    const s = scroller();
    const el = refWrap.current;
    const atual = el.getBoundingClientRect().height;
    if (altura !== null && atual > auto + 8) {
      // volta ao normal
      const sc = s.scrollTop - (atual - auto);
      setAltura(null);
      requestAnimationFrame(() => (s.scrollTop = Math.max(0, sc)));
    } else {
      const h = maxima();
      setAltura(h);
      requestAnimationFrame(() => {
        const topoAlca = refAlca.current.getBoundingClientRect().top + s.scrollTop;
        s.scrollTop = Math.max(0, topoAlca - MARGEM / 2);
      });
    }
  };

  const h = altura ?? auto;

  return (
    <div className="tabela-arrastavel">
      <div
        ref={refAlca}
        className={'puxador' + (arrastando ? ' ativo' : '')}
        onMouseDown={iniciar}
        onDoubleClick={alternarMaximo}
        title="Arraste para cima para aumentar a tabela · duplo clique: maximizar / restaurar"
        role="separator"
        aria-orientation="horizontal"
      >
        <span className="puxador-pega" />
      </div>
      {cabecalho}
      <div ref={refWrap} className={'tabela-wrap arrastavel ' + className} style={{ height: h }}>
        {children}
      </div>
    </div>
  );
}
