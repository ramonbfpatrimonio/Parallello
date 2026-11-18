import { createContext, useContext } from 'react';

export const CobrancaCtx = createContext(null);
export const useCobranca = () => useContext(CobrancaCtx);

// Monta os campos de "quem fez" de registros e eventos
export function autoria(ctx) {
  return {
    operador_id: ctx.operador?.id || null,
    operador_nome: ctx.operador?.nome || null,
    usuario_parallello: ctx.usuario || null,
  };
}
