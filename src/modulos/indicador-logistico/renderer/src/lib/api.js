export async function api(canal, dados) {
  const r = await window.api.chamar(canal, dados);
  if (!r || !r.ok) throw new Error(r?.erro || 'Erro desconhecido');
  return r.dados;
}
