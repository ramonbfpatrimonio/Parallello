import React, { useEffect, useRef, useState } from 'react';
import { useCobranca } from '../contexto.js';
import { Botao, Vazio } from './ui.jsx';

export function TelaPin({ onEntrar, areaAberta, abrirArea }) {
  const { nuvem } = useCobranca();
  const [ops, setOps] = useState(null);
  const [erro, setErro] = useState('');
  const [escolhido, setEscolhido] = useState(null);
  const [pin, setPin] = useState('');
  const [entrando, setEntrando] = useState(false);
  const ref = useRef(null);

  const carregar = async () => {
    setErro('');
    try { setOps((await nuvem.listarOperadores()).filter((o) => o.ativo)); }
    catch (e) { setErro(e.message); setOps([]); }
  };
  useEffect(() => { carregar(); }, [areaAberta]); // recarrega depois que o admin mexe nos operadores
  useEffect(() => { if (escolhido) ref.current?.focus(); }, [escolhido]);

  const entrar = async (e) => {
    e?.preventDefault();
    if (!escolhido || !pin) return;
    setEntrando(true); setErro('');
    try {
      const op = await nuvem.entrarComPin(escolhido.id, pin);
      if (!op) { setErro('PIN incorreto.'); setPin(''); ref.current?.focus(); return; }
      onEntrar(op);
    } catch (err) { setErro(err.message); }
    finally { setEntrando(false); }
  };

  return (
    <div className="cob-pin">
      <div className="cob-pin-cartao">
        <div className="cob-pin-cabeca">
          <span className="cob-logo cob-logo-g">R$</span>
          <div>
            <h2>Cobrança</h2>
            <p>Acesso restrito aos operadores de cobrança.</p>
          </div>
        </div>

        {ops === null && <div className="cob-centro-p"><span className="cob-spin cob-spin-g" /></div>}

        {ops && !ops.length && (
          <Vazio titulo="Nenhum operador cadastrado"
            texto="O administrador cadastra os operadores e os PINs na Área do sistema (Ctrl+Shift+B, com a senha do Parallello).">
            {areaAberta && <Botao variante="primario" onClick={abrirArea}>Abrir Área do sistema</Botao>}
          </Vazio>
        )}

        {ops && ops.length > 0 && !escolhido && (
          <>
            <p className="cob-pin-instrucao">Quem é você?</p>
            <div className="cob-pin-ops">
              {ops.map((o) => (
                <button key={o.id} type="button" className="cob-pin-op" onClick={() => { setEscolhido(o); setPin(''); setErro(''); }}>
                  <span className="cob-avatar">{o.nome.slice(0, 2)}</span>
                  <span>{o.nome}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {escolhido && (
          <form onSubmit={entrar} className="cob-pin-form">
            <div className="cob-pin-quem">
              <span className="cob-avatar">{escolhido.nome.slice(0, 2)}</span>
              <strong>{escolhido.nome}</strong>
              <button type="button" className="cob-link" onClick={() => { setEscolhido(null); setErro(''); }}>trocar</button>
            </div>
            <input ref={ref} className="cob-pin-input" type="password" inputMode="numeric" autoComplete="off"
              placeholder="PIN" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            {erro && <div className="cob-campo-erro cob-centro-t">{erro}</div>}
            <Botao variante="primario" carregando={entrando} onClick={entrar} disabled={!pin}>Entrar</Botao>
          </form>
        )}

        {!escolhido && erro && <div className="cob-campo-erro">{erro}</div>}
      </div>
    </div>
  );
}
