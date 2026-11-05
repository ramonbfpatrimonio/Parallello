import { useEffect, useRef, useState } from 'react';
import Icone from './Icone.jsx';
import logo from '../assets/logo.svg';

// Menu lateral: abre ao passar o mouse por cima e recolhe quando o mouse sai
export default function Sidebar({ itens, ativo, aoSelecionar }) {
  const [aberto, setAberto] = useState(false);
  const timer = useRef(null);

  const agendar = (valor, atraso) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAberto(valor), atraso);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const grupos = [...new Set(itens.map((i) => i.grupo))];

  return (
    <nav
      className={'sidebar' + (aberto ? ' aberta' : '')}
      onMouseEnter={() => agendar(true, 60)}
      onMouseLeave={() => agendar(false, 120)}
      onFocus={() => agendar(true, 0)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) agendar(false, 0);
      }}
    >
      <div className="sidebar-marca">
        <img className="logo" src={logo} alt="" />
        <div className="marca-texto">
          <strong>Comissões</strong>
          <span>por contas recebidas</span>
        </div>
      </div>

      {grupos.map((g) => (
        <div className="sidebar-grupo" key={g}>
          <div className="sidebar-grupo-titulo">{g}</div>
          {itens
            .filter((i) => i.grupo === g)
            .map((i) => (
              <button
                key={i.id}
                className={'sidebar-item' + (ativo === i.id ? ' ativo' : '')}
                onClick={() => {
                  aoSelecionar(i.id);
                  agendar(false, 150);
                }}
                title={aberto ? '' : i.rotulo}
              >
                <Icone nome={i.icone} tamanho={20} />
                <span className="rotulo">{i.rotulo}</span>
              </button>
            ))}
        </div>
      ))}

      <div className="sidebar-rodape">
        <span className="rotulo">Dados salvos neste computador</span>
      </div>
    </nav>
  );
}
