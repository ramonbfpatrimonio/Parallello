import { useState } from 'react';
import { api } from '../lib/api';
import Icone from './Icone';

// Excel, PDF e Imprimir — usados na consulta e no histórico
export default function BotoesSaida({ dados, desativado, aviso }) {
  const [ocupado, setOcupado] = useState('');

  async function executar(tipo) {
    setOcupado(tipo);
    try {
      const d = dados();
      if (tipo === 'imprimir') {
        const ok = await api.imprimir(d);
        if (ok) aviso('Enviado para a impressora.');
        return;
      }
      const destino = tipo === 'excel' ? await api.exportarExcel(d) : await api.exportarPdf(d);
      if (destino) aviso(`Arquivo salvo em ${destino}`);
    } catch (e) {
      aviso(e.message, 'erro');
    } finally {
      setOcupado('');
    }
  }

  return (
    <>
      <button className="sec" onClick={() => executar('excel')} disabled={desativado || !!ocupado}><Icone nome="planilha" tamanho={16} /> Excel</button>
      <button className="sec" onClick={() => executar('pdf')} disabled={desativado || !!ocupado}><Icone nome="pdf" tamanho={16} /> PDF</button>
      <button className="sec" onClick={() => executar('imprimir')} disabled={desativado || !!ocupado}>
        <Icone nome="imprimir" tamanho={16} /> {ocupado === 'imprimir' ? 'Abrindo...' : 'Imprimir'}
      </button>
    </>
  );
}
