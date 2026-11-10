// Chamadas ao processo principal; lança erro quando a operação falha
export const api = new Proxy({}, {
  get: (_alvo, nome) => async (...args) => {
    if (!window.api || !window.api[nome]) throw new Error(`Função indisponível: ${String(nome)}`);
    const r = await window.api[nome](...args);
    if (!r.ok) throw new Error(r.erro);
    return r.dados;
  }
});
