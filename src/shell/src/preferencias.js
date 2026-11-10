// Preferências só deste computador (tema e jeito de ver os módulos), guardadas no navegador do Parallello.
const ler = (k, padrao, validos) => {
  try {
    const v = localStorage.getItem(k)
    return validos.includes(v) ? v : padrao
  } catch {
    return padrao
  }
}
const gravar = (k, v) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sem armazenamento: vale só até fechar */
  }
}

export const TEMAS = ['claro', 'escuro']
export const lerTema = () => ler('parallello.tema', 'claro', TEMAS)
export function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema
  gravar('parallello.tema', tema)
  // o mesmo tema nas telas de todos os sistemas
  void window.parallello?.definirTema?.(tema)?.catch?.(() => {})
}

export const VISOES = ['grande', 'medio', 'lista']
export const lerVisao = () => ler('parallello.visao', 'grande', VISOES)
export const gravarVisao = (v) => gravar('parallello.visao', v)
