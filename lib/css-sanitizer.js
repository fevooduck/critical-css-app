import postcss from 'postcss';

/**
 * Sanitiza e repara strings CSS com erros de sintaxe (parênteses não fechados,
 * blocos incompletos, concatenações truncadas por minificadores/CMS, etc.),
 * garantindo que o PostCSS consiga fazer o parse sem lançar CssSyntaxError.
 *
 * @param {string} css - Código CSS original
 * @returns {string} - Código CSS reparado e válido para parse do PostCSS
 */
export function sanitizeCss(css) {
  if (!css || typeof css !== 'string' || !css.trim()) {
    return css || '';
  }

  // Caminho rápido: se o PostCSS já consegue fazer o parse diretamente, retorne sem alterações
  try {
    postcss.parse(css);
    return css;
  } catch (initialErr) {
    if (initialErr.name !== 'CssSyntaxError') {
      return css;
    }
  }

  let repaired = css;
  const maxPasses = 15;

  for (let pass = 0; pass < maxPasses; pass++) {
    try {
      postcss.parse(repaired);
      return repaired;
    } catch (err) {
      if (err.name !== 'CssSyntaxError') {
        return repaired;
      }

      const offset = err.input?.offset;

      if (err.reason === 'Unclosed bracket' && offset != null) {
        const char = repaired[offset];
        const matchClosing = char === '(' ? ')' : char === '[' ? ']' : '}';
        let depth = 0;
        let fixApplied = false;

        for (let i = offset; i < repaired.length; i++) {
          if (repaired[i] === '(' || repaired[i] === '[') {
            depth++;
          } else if (repaired[i] === ')' || repaired[i] === ']') {
            depth--;
          } else if (repaired[i] === '{' && i > offset) {
            // Um novo bloco está abrindo com parênteses/colchetes ainda abertos.
            // Exemplo típico: --var: var(a, var(b) selector { ... }
            const neededClosing = ')'.repeat(Math.max(0, depth));
            let lastSep = i - 1;
            while (
              lastSep > offset &&
              repaired[lastSep] !== ';' &&
              repaired[lastSep] !== '}' &&
              repaired[lastSep] !== ')'
            ) {
              lastSep--;
            }

            if (repaired[lastSep] === ')') {
              repaired =
                repaired.slice(0, lastSep + 1) +
                neededClosing +
                ';}\n' +
                repaired.slice(lastSep + 1);
              fixApplied = true;
              break;
            } else {
              repaired =
                repaired.slice(0, offset) +
                '/* [malformed declaration removed] */' +
                repaired.slice(i);
              fixApplied = true;
              break;
            }
          }
        }

        if (!fixApplied) {
          // Inserir fechamento antes do próximo ';' ou '}' se houver
          const nextSemi = repaired.indexOf(';', offset);
          const nextBrace = repaired.indexOf('}', offset);
          const candidates = [nextSemi, nextBrace].filter((idx) => idx !== -1);
          if (candidates.length > 0) {
            const insertPos = Math.min(...candidates);
            repaired =
              repaired.slice(0, insertPos) +
              matchClosing +
              repaired.slice(insertPos);
          } else {
            repaired += matchClosing;
          }
        }
      } else if (err.reason === 'Unclosed block') {
        repaired += '\n}';
      } else if (err.reason === 'Unclosed string' && offset != null) {
        const quote = repaired[offset] === '\'' ? '\'' : '"';
        const nextSemi = repaired.indexOf(';', offset);
        const nextNewline = repaired.indexOf('\n', offset);
        const candidates = [nextSemi, nextNewline].filter((idx) => idx !== -1);
        const insertPos = candidates.length > 0 ? Math.min(...candidates) : repaired.length;
        repaired =
          repaired.slice(0, insertPos) + quote + repaired.slice(insertPos);
      } else if (err.reason === 'Extra }' || err.reason === 'Unexpected }') {
        if (offset != null) {
          repaired = repaired.slice(0, offset) + repaired.slice(offset + 1);
        } else {
          break;
        }
      } else {
        // Erro genérico de sintaxe: neutralizar o trecho inválido
        if (offset != null) {
          const nextSemi = repaired.indexOf(';', offset);
          const nextBrace = repaired.indexOf('}', offset);
          const candidates = [nextSemi, nextBrace].filter((idx) => idx !== -1);
          const cut =
            candidates.length > 0
              ? Math.min(...candidates) + 1
              : repaired.length;
          const startCut = Math.max(0, offset - 1);
          repaired =
            repaired.slice(0, startCut) +
            '/* [syntax error removed] */' +
            repaired.slice(cut);
        } else {
          break;
        }
      }
    }
  }

  // Verificação final
  try {
    postcss.parse(repaired);
    return repaired;
  } catch {
    return css;
  }
}

/**
 * Sanitiza todas as tags <style> contidas em uma string HTML.
 *
 * @param {string} html - HTML completo da página
 * @returns {string} - HTML com o conteúdo de todas as tags <style> sanitizado
 */
export function sanitizeHtmlStyles(html) {
  if (!html || typeof html !== 'string') return html || '';
  return html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (match, openTag, cssContent, closeTag) => {
      return openTag + sanitizeCss(cssContent) + closeTag;
    },
  );
}
