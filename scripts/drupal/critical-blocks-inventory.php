<?php
// Inventário dos blocos "CSS Critical" (block_content) e seus placements por tema.
// Uso: lando drush @cookit-2 php:script "$PWD/scripts/drupal/critical-blocks-inventory.php"
$out = [];
$storage = \Drupal::entityTypeManager()->getStorage('block_content');
$ids = \Drupal::entityQuery('block_content')->accessCheck(FALSE)->execute();
$blocks = \Drupal::entityTypeManager()->getStorage('block')->loadMultiple();
foreach ($storage->loadMultiple($ids) as $bc) {
  $label = $bc->label();
  $body = '';
  foreach (['body', 'field_script_css', 'field_css', 'field_script'] as $f) {
    if ($bc->hasField($f) && !$bc->get($f)->isEmpty()) { $body .= $bc->get($f)->value; }
  }
  if (!preg_match('/critical/i', $label) && $bc->bundle() !== 'script_css_header_bock') continue;
  $placements = [];
  foreach ($blocks as $b) {
    if ($b->getPluginId() === 'block_content:' . $bc->uuid()) {
      $vis = $b->getVisibility();
      $placements[] = [
        'id' => $b->id(), 'theme' => $b->getTheme(), 'region' => $b->getRegion(), 'status' => $b->status(),
        'pages' => $vis['request_path']['pages'] ?? '', 'negate' => $vis['request_path']['negate'] ?? FALSE,
        'bundles' => array_keys($vis['entity_bundle:node']['bundles'] ?? ($vis['node_type']['bundles'] ?? [])),
        'other_vis' => array_values(array_diff(array_keys($vis), ['request_path', 'entity_bundle:node', 'node_type'])),
      ];
    }
  }
  $out[] = [
    'bcid' => $bc->id(), 'bundle' => $bc->bundle(), 'label' => $label, 'bytes' => strlen($body),
    'has_btn_cta' => (bool) preg_match('/\.btn\s*,\s*\.cta|\.cta\s*,\s*\.btn/', $body),
    'has_color_cta_vars' => (bool) preg_match('/--color-cta-/', $body),
    'has_mb7' => (bool) preg_match('/\.mb-7\b/', $body),
    'has_filter_vars' => (bool) preg_match('/--filter-(white|black)\s*:/', $body),
    'has_root' => (bool) preg_match('/:root\s*\{/', $body),
    'placements' => $placements,
  ];
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
