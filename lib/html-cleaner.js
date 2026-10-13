import * as cheerio from 'cheerio';
import postcss from 'postcss';
import { sanitizeCss, sanitizeHtmlStyles } from './css-sanitizer.js';

export { sanitizeHtmlStyles };

/**
 * Remove elementos do HTML baseado nos seletores CSS especificados
 * antes da extração do CSS crítico.
 * 
 * @param {string} html - HTML renderizado da página
 * @param {string[]} selectors - Lista de seletores CSS para excluir (ex: ['header', '#header', '.modal'])
 * @returns {{ html: string, removedCount: number, removedDetails: Array<{selector: string, count: number}> }}
 */
export function removeExcludedElements(html, selectors = []) {
  if (!html || typeof html !== 'string') {
    return { html: html || '', removedCount: 0, removedDetails: [] };
  }

  if (!Array.isArray(selectors) || selectors.length === 0) {
    return { html, removedCount: 0, removedDetails: [] };
  }

  const validSelectors = selectors
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);

  if (validSelectors.length === 0) {
    return { html, removedCount: 0, removedDetails: [] };
  }

  try {
    const $ = cheerio.load(html, { decodeEntities: false });
    let totalRemoved = 0;
    const removedDetails = [];

    for (const selector of validSelectors) {
      try {
        const matches = $(selector);
        const count = matches.length;
        if (count > 0) {
          totalRemoved += count;
          matches.remove();
          removedDetails.push({ selector, count });
        }
      } catch (err) {
        console.warn(
          `  ⚠️ Seletor inválido para exclusão do HTML ("${selector}"):`,
          err.message,
        );
      }
    }

    if (totalRemoved > 0) {
      return { html: $.html(), removedCount: totalRemoved, removedDetails };
    }

    return { html, removedCount: 0, removedDetails: [] };
  } catch (error) {
    console.error('  ⚠️ Erro ao processar HTML com Cheerio:', error.message);
    return { html, removedCount: 0, removedDetails: [] };
  }
}

/**
 * Converte a lista de seletores excluídos em RegExp para uso no Penthouse (forceExclude)
 * e no Critical (ignore.rule).
 * 
 * @param {string[]} selectors - Lista de seletores CSS
 * @returns {RegExp[]}
 */
export function buildCssIgnoreRules(selectors = []) {
  const baseRules = [/tint/i];

  if (!Array.isArray(selectors)) return baseRules;

  for (const s of selectors) {
    if (!s || typeof s !== 'string') continue;
    const trimmed = s.trim();
    if (!trimmed) continue;

    // Seletor de atributo, ex: [class*="onetrust"], div[data-banner], [id^='header']
    const attrMatch = trimmed.match(
      /^([a-zA-Z0-9_-]*)\[\s*([a-zA-Z0-9_-]+)\s*(?:([*^$~|]?=)\s*(['"]?)(.*?)\4)?\s*\]$/,
    );

    if (attrMatch) {
      const tag = attrMatch[1];
      const attr = attrMatch[2];
      const op = attrMatch[3] || '';
      const val = attrMatch[5] || '';
      const escapedAttr = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedVal = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tagPrefix = tag ? tag + '\\s*' : '';

      // 1. Casa o seletor de atributo no CSS com aspas duplas, simples ou sem aspas
      if (op && val) {
        const opEscaped = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        baseRules.push(
          new RegExp(
            tagPrefix +
              '\\[\\s*' +
              escapedAttr +
              '\\s*' +
              opEscaped +
              '\\s*[\'"]?' +
              escapedVal +
              '[\'"]?\\s*\\]',
            'i',
          ),
        );
      } else {
        baseRules.push(
          new RegExp(tagPrefix + '\\[\\s*' + escapedAttr + '\\s*\\]', 'i'),
        );
      }

      // 2. Se for atributo "class", casar também seletores de classe equivalentes no CSS
      if (attr.toLowerCase() === 'class' && val) {
        if (op === '*=') {
          // [class*="onetrust"] casa com .onetrust, .onetrust-banner, .ot-onetrust-box, etc.
          baseRules.push(new RegExp('\\.[a-zA-Z0-9_-]*' + escapedVal, 'i'));
        } else if (op === '^=') {
          // [class^="ot-"] casa com .ot-banner, .ot-theme, etc.
          baseRules.push(new RegExp('\\.' + escapedVal, 'i'));
        } else if (op === '$=') {
          // [class$="-banner"] casa com .cookie-banner, .alert-banner, etc.
          baseRules.push(
            new RegExp(
              '\\.[a-zA-Z0-9_-]*' + escapedVal + '([^a-zA-Z0-9_-]|$)',
              'i',
            ),
          );
        } else if (op === '=' || op === '~=' || !op) {
          baseRules.push(
            new RegExp('\\.' + escapedVal + '([^a-zA-Z0-9_-]|$)', 'i'),
          );
        }
      }

      // 3. Se for atributo "id", casar também seletores de ID equivalentes no CSS
      if (attr.toLowerCase() === 'id' && val) {
        if (op === '*=') {
          baseRules.push(new RegExp('#[a-zA-Z0-9_-]*' + escapedVal, 'i'));
        } else if (op === '^=') {
          baseRules.push(new RegExp('#' + escapedVal, 'i'));
        } else if (op === '=' || !op) {
          baseRules.push(
            new RegExp('#' + escapedVal + '([^a-zA-Z0-9_-]|$)', 'i'),
          );
        }
      }

      continue;
    }

    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (trimmed.startsWith('#')) {
      // ID: ex: #header -> casa com #header, #header > ..., #header-container, etc.
      baseRules.push(new RegExp(escaped + '([-\\w\\s>+~,.:#\\[]|$)', 'i'));
    } else if (trimmed.startsWith('.')) {
      // Classe: ex: .modal -> casa com .modal, .modal-dialog, .modal__box, etc.
      baseRules.push(new RegExp(escaped + '([-\\w\\s>+~,.:#\\[]|$)', 'i'));
    } else if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      // Tag HTML pura: ex: header -> casa com header, header > ..., header.classe, etc.
      baseRules.push(
        new RegExp('(^|[\\s>+~,])' + escaped + '([-\\w\\s>+~,.:#\\[]|$)', 'i'),
      );
    } else {
      // Seletor genérico complexo
      baseRules.push(new RegExp(escaped, 'i'));
    }
  }

  return baseRules;
}

/**
 * Filtra regras de CSS removendo qualquer regra cujo seletor pertença
 * aos seletores excluídos ou seus descendentes.
 * 
 * @param {string} css - String de CSS gerada
 * @param {RegExp[]} ignoreRules - Lista de RegExp de seletores a ignorar
 * @returns {string} - CSS filtrado
 */
export function filterCssByExcludedRules(css, ignoreRules = []) {
  if (!css || !Array.isArray(ignoreRules) || ignoreRules.length === 0) {
    return css;
  }

  try {
    const cleanCss = sanitizeCss(css);
    const root = postcss.parse(cleanCss);

    root.walkRules((rule) => {
      const selectors = rule.selectors || [rule.selector];
      const kept = selectors.filter((sel) => {
        return !ignoreRules.some((regex) => regex.test(sel));
      });

      if (kept.length === 0) {
        rule.remove();
      } else if (kept.length !== selectors.length) {
        rule.selectors = kept;
      }
    });

    return root.toString();
  } catch (err) {
    console.warn(
      '  ⚠️ Aviso ao filtrar regras CSS residuais via PostCSS:',
      err.message,
    );
    return css;
  }
}
