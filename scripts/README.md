# Scripts de apoio

Ferramentas de linha de comando em volta do gerador (o app em si é `server.js` + `main.js` + `lib/` na raiz).

**Rode sempre a partir da raiz do projeto** (`node scripts/<pasta>/<script>`): os caminhos `data/...` usados como entrada e saída são relativos ao diretório atual. Cada script tem no cabeçalho o que faz e o `Uso:` completo.

## `templates/` — crítico por template do new_cookit

| Script | Para quê |
| --- | --- |
| `generate-templates.mjs` | Gera o crítico de cada template de `templates.config.json` em lote (`npm run templates`). |
| `validate-templates.mjs` | Valida o crítico gerado (shell.css + delta) contra a página real (`npm run templates:validate`). |
| `templates.config.json` | Templates, URLs de exemplo, tema e orçamento usados pelos dois acima. |
| `generate-block.mjs` | Gera o bloco "CSS Critical" (mobile + desktop) de uma URL pela API local, pronto para colar. |
| `probe-block-swap.mjs` | Testa um bloco novo numa URL publicada (troca os `<style>` e mede CLS) antes de colar no Drupal. |
| `probe-critical-vs-final.mjs` | Compara a 1ª pintura (só crítico, sem JS) com o estado final. |
| `shot-critical-only.mjs` | Screenshot da página só com o CSS inline. |
| `shot-snapshot.mjs` | Mostra o snapshot que o gerador "vê" e a posição dos seletores pedidos. |
| `debug-generate-stage.mjs` | Roda o pipeline por etapas e conta seletores em cada uma (onde uma regra some). |

## `drupal/` — inventários no banco (via `lando drush`)

| Script | Para quê |
| --- | --- |
| `critical-blocks-inventory.php` | Blocos "CSS Critical" e seus placements por tema. |
| `db-theme-links-inventory.php` | Blocos e campos que apontam para `/themes/custom/cookit/` (ativação do new_cookit). |

## `theme-compare/` — tema novo (new_cookit) × tema velho (cookit)

| Script | Para quê |
| --- | --- |
| `compare-lp.mjs` | De/para visual + estilos computados de uma LP entre dois ambientes. |
| `compare-lp-diff.mjs` | Lista as diferenças de estilo dos JSON do `compare-lp`. |
| `compare-lp-batch.mjs` | De/para em lote das component pages (retomável). |
| `component-pages-triage.mjs` | Triagem do lote: tira ruído, agrupa diferenças, classifica páginas. |
| `sbs-thumb.mjs` | Miniatura lado a lado (velho \| novo) dos screenshots do lote. |
| `compare-shots.js` | Recorte lado a lado só das faixas que mudaram entre duas pastas de PNGs. |
| `probe-cta-colors.mjs` | Cores dos botões (normal/hover) em dois ambientes. |
| `audit-class-collisions.mjs` | Seletores e variáveis com o mesmo nome e valor diferente entre CSS legado e novo. |
| `audit-root-duplicates.mjs` | Custom properties do `:root` legado × novo. |
| `smoke-new-cookit.mjs` | Smoke + performance de laboratório do new_cookit. |

## `audits/` — auditorias de página

| Script | Para quê |
| --- | --- |
| `audit-css-order.js` | Declarações que dependem da ordem dos stylesheets (que o crítico pode quebrar). |
| `audit-headings.js` | Saltos na hierarquia de headings visíveis. |
| `audit-single-image.mjs` | CLS e caixa final do `section_single_image` por página/viewport. |
| `compare-single-image.mjs` | Compara duas rodadas do `audit-single-image`. |
| `run-single-image-final.sh` | Fila final da auditoria do single-image (um processo por vez). |
| `probe-single-image-box.mjs` | Mede a caixa de um `.single-image` numa URL/viewport. |

## `perf/` — LCP, CLS, fontes e imagens

| Script | Para quê |
| --- | --- |
| `probe-lcp-blocking.mjs` | LCP, FCP, recursos bloqueantes e long tasks (mobile lento). |
| `probe-lcp-image.mjs` | Linha do tempo de download das imagens candidatas a LCP. |
| `ab-card-priority.mjs` | A/B do 1º card eager/high × lazy. |
| `probe-shift-sources.mjs` / `probe-shift-sources-long.mjs` | Fontes de layout-shift no mobile. |
| `probe-shift-desktop.mjs` | Fontes de layout-shift no desktop (viewport do PSI). |
| `probe-remote-header.mjs` | Filmstrip, shifts e carregamento de CSS no topo de uma URL publicada. |
| `font-fallback-metrics.mjs` | Calcula overrides de métricas para fallback local imitar a web font. |
| `compare-font-fallback.mjs` | Confere no Chromium se o fallback imita a web font. |
| `ab-typekit-embed.mjs` | A/B na página real: kit JS do Typekit × embed CSS + fallback. |
| `probe-srcset-pick.mjs` | Qual arquivo do srcset cada aparelho escolhe e quanto pesa. |
| `estimate-webp-quality.mjs` | Peso de uma imagem em webp com outras qualidades/larguras. |
| `analyze-shift.js` / `diagnose-cls.js` | Diagnósticos de CLS antigos (out/2025). |

## `components/` — inspeção de componentes (SDC/paragraphs)

| Script | Para quê |
| --- | --- |
| `probe-card-styles.mjs` | Estilos computados de cards. |
| `probe-slide.mjs` | Estilos do slide/card de receita num carrossel. |
| `probe-unmounted-glide.mjs` | Carrosséis `.glide` que não montaram. |
| `probe-history-img.mjs` | Estado das imagens do histórico de receitas. |
| `probe-offers.mjs` | Aba de ofertas do perfil logado e FAQ de receita. |
| `probe-page-errors.mjs` | Erros JS (com stack) de uma página. |
| `probe-root-vars.mjs` | Custom properties do `:root` em 3 larguras. |
| `probe-toolbar-offset.mjs` | `padding-top` do body com a toolbar do Drupal. |
| `shot-section.mjs` | Screenshot de um elemento qualquer. |
| `shot-card-recipe.mjs`, `shot-history-recipes.mjs`, `shot-ingredients-search.mjs`, `shot-recipe-sliders.mjs`, `shot-recipe-versions.mjs`, `shot-related-articles.mjs` | Screenshots/testes de componentes específicos de receita. |

## `legacy/`

`test-*.js` — experimentos iniciais do gerador (out/2025), mantidos só como referência.
