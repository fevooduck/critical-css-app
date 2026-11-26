#!/usr/bin/env bash
# Fila final da auditoria do single-image (um processo por vez, para não estourar a memória do WSL).
#  1) refaz as páginas com erro do "depois2" no cookit e no cookit-3 (imagens do cookit-2);
#  2) "antes-img" no cookit-3: volta só o template do single-image do tema cookit (sem as classes
#     novas o CSS novo não pega), mede com as imagens do cookit-2 e restaura o template (trap garante).
# Retomável: o audit pula páginas já medidas sem erro. Log: data/single-image/final.log
set -u
cd "$(dirname "$0")/../.."
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" VPS=mobile,desktop
REPO=/home/codeduck/projects/nestle-cult
TPL=docroot/themes/custom/cookit/templates/paragraph/section/paragraph--section-single-image.html.twig
BAK=data/single-image/backup-single-image.html.twig
LOG=data/single-image/final.log
LANDO="$HOME/.lando/bin/lando"
FILES=https://cookit-2.lndo.site/sites/cookit-2/files

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }
restore() {
  if [ -f "$BAK" ]; then cp "$BAK" "$REPO/$TPL" && rm -f "$BAK" && log "template do single-image restaurado"; (cd "$REPO" && timeout 180 "$LANDO" drush @cookit-3 cr >/dev/null 2>&1); fi
}
trap restore EXIT

# Se uma execução anterior caiu no meio do passo 2, o backup ainda existe: restaura antes de tudo.
restore

log "1/3 depois2 cookit (páginas com erro)"
node scripts/audits/audit-single-image.mjs depois2 https://cookit.lndo.site data/single-image/cookit-pages.tsv >> data/single-image/depois2-cookit.log 2>&1
log "2/3 depois2 cookit-3 (páginas com erro, imagens do cookit-2)"
FILES_FROM=$FILES node scripts/audits/audit-single-image.mjs depois2 https://cookit-3.lndo.site data/single-image/cookit-3-pages.tsv >> data/single-image/depois2-cookit-3.log 2>&1

log "3/3 antes-img cookit-3: voltando o template do single-image"
cp "$REPO/$TPL" "$BAK"
(cd "$REPO" && git show "HEAD:$TPL" > "$TPL")
(cd "$REPO" && timeout 180 "$LANDO" drush @cookit-3 cr >/dev/null 2>&1)
if curl -sk https://cookit-3.lndo.site/marcas/ninho | grep -q 'single-image__picture'; then
  log "ERRO: o template antigo não entrou (single-image__picture ainda no HTML); abortando o passo 3"
  exit 1
fi
FILES_FROM=$FILES node scripts/audits/audit-single-image.mjs antes-img https://cookit-3.lndo.site data/single-image/cookit-3-pages.tsv >> data/single-image/antes-img-cookit-3.log 2>&1
restore
log "FIM"
