// Impressão/PDF "igual à tela": congela o layout atual (largura e colunas de cada grade)
// e reduz tudo proporcionalmente com zoom para caber na largura da folha A4 deitada.
// Sem isso, ao imprimir, o navegador recalcula o layout na largura da folha, as regras
// de telas menores entram em ação e os cards descem um embaixo do outro.

// largura útil da folha A4 deitada em px CSS (11,69" menos as margens), com folga
const LARGURA_FOLHA = 1040;

export async function comLayoutDaTela(seletor, fn) {
  const raiz = document.querySelector(seletor);
  if (!raiz) return fn();
  const largura = Math.ceil(raiz.getBoundingClientRect().width);
  const congelados = [];
  const congelar = (el, prop, valor) => { congelados.push([el, prop, el.style[prop]]); el.style[prop] = valor; };

  const ehGrade = (cs) => cs.display === 'grid' || cs.display === 'inline-grid';
  [raiz, ...raiz.querySelectorAll('*')].forEach((el) => {
    const cs = getComputedStyle(el);
    if (ehGrade(cs)) {
      congelar(el, 'gridTemplateColumns', cs.gridTemplateColumns);
      // a posição de cada item também fica como na tela (regras de tela menor mudam o "grid-column")
      [...el.children].forEach((filho) => {
        const fs = getComputedStyle(filho);
        ['gridColumnStart', 'gridColumnEnd', 'gridRowStart', 'gridRowEnd'].forEach((prop) => congelar(filho, prop, fs[prop]));
      });
    }
  });
  congelar(raiz, 'width', `${largura}px`);
  congelar(raiz, 'maxWidth', 'none');

  const zoom = Math.min(1, LARGURA_FOLHA / largura);
  document.documentElement.style.setProperty('--zoom-impressao', String(zoom));
  document.body.classList.add('imprimindo-tela');
  try {
    return await fn();
  } finally {
    congelados.reverse().forEach(([el, prop, v]) => { el.style[prop] = v; });
    document.body.classList.remove('imprimindo-tela');
    document.documentElement.style.removeProperty('--zoom-impressao');
  }
}
