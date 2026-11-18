import React, { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Download, AppWindow, Loader2 } from 'lucide-react';
import { api } from '../util.js';
import { CabecalhoPagina, Vazio } from '../componentes.jsx';

// Manual do usuário (operador) anexado ao instalador. Mostra o PDF dentro do sistema
// e oferece abrir em janela própria, no leitor de PDF do Windows ou salvar uma cópia.
export default function Manual() {
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { api.manualInfo().then(setInfo).catch((e) => setErro(e.message)); }, []);

  const acao = (fn, ok) => async () => {
    setErro(''); setMsg('');
    try { const r = await fn(); if (ok && r) setMsg(ok(r)); } catch (e) { setErro(e.message); }
  };

  // no modo de desenvolvimento a página vem de http:// e não pode embutir arquivo local
  const podeEmbutir = info && window.location.protocol === 'file:';

  return (
    <div className="pagina cheia manual-pagina">
      <CabecalhoPagina
        titulo="Manual do usuário"
        subtitulo="Guia do operador: telas, ficha do cliente, decisões e cálculo do score"
        acoes={info && (
          <div className="grupo-botoes">
            <button className="btn" onClick={acao(api.manualAbrirJanela)} title="Abre o manual em uma janela separada"><AppWindow size={15} />Abrir em janela</button>
            <button className="btn" onClick={acao(api.manualAbrirExterno)} title="Abre no leitor de PDF do Windows"><ExternalLink size={15} />Leitor de PDF</button>
            <button className="btn" onClick={acao(api.manualSalvar, (p) => `Cópia salva em ${p}`)}><Download size={15} />Salvar cópia</button>
          </div>
        )}
      />
      {erro && <div className="erro">{erro}</div>}
      {msg && <div className="sucesso">{msg}</div>}
      <div className="card manual-visor">
        {!info && !erro && <Vazio icone={Loader2} titulo="Carregando o manual…" />}
        {info && podeEmbutir && <iframe title="Manual do usuário" src={`${info.url}#view=FitH`} />}
        {info && !podeEmbutir && (
          <Vazio icone={BookOpen} titulo="Manual do usuário"
            texto="Use “Abrir em janela” ou “Leitor de PDF” para ler o manual." />
        )}
      </div>
    </div>
  );
}
