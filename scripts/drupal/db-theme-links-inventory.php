<?php
// Inventário para a ativação do new_cookit (somente leitura):
// - blocos "CSS Critical" e "BTN Buy now" (script_css_header_bock) com placements;
// - blocos e campos de texto de nodes/paragraphs que apontam para /themes/custom/cookit/.
// Uso: lando drush @cookit-2 ev "$(sed 1d scripts/drupal/db-theme-links-inventory.php)" > data/db-theme-links/cookit-2.json

$db = \Drupal::database();
$etm = \Drupal::entityTypeManager();
$blocks = $etm->getStorage('block')->loadMultiple();
$aliases = \Drupal::service('path_alias.manager');

$placements = function ($uuid) use ($blocks) {
  $out = [];
  foreach ($blocks as $b) {
    if ($b->getPluginId() !== 'block_content:' . $uuid) continue;
    $vis = $b->getVisibility();
    $out[] = [
      'id' => $b->id(), 'theme' => $b->getTheme(), 'status' => (bool) $b->status(), 'region' => $b->getRegion(),
      'pages' => array_values(array_filter(array_map('trim', preg_split('/\R/', $vis['request_path']['pages'] ?? '')))),
      'negate' => (bool) ($vis['request_path']['negate'] ?? FALSE),
      'node_bundles' => array_keys($vis['entity_bundle:node']['bundles'] ?? []),
      'term_bundles' => array_keys($vis['entity_bundle:taxonomy_term']['bundles'] ?? []),
      'roles' => array_keys($vis['user_role']['roles'] ?? []),
    ];
  }
  return $out;
};

$result = ['critical' => [], 'buy_now' => [], 'block_links' => [], 'content_links' => []];

foreach ($etm->getStorage('block_content')->loadMultiple() as $bc) {
  $body = '';
  foreach ($bc->getFields() as $name => $field) {
    if (in_array($field->getFieldDefinition()->getType(), ['text_long', 'text_with_summary', 'string_long', 'text'], TRUE)) {
      foreach ($field as $item) $body .= (string) $item->value;
    }
  }
  $label = $bc->label();
  $row = ['bcid' => (int) $bc->id(), 'bundle' => $bc->bundle(), 'label' => $label, 'bytes' => strlen($body), 'placements' => $placements($bc->uuid())];

  if (preg_match('/critical/i', $label) && $bc->bundle() === 'script_css_header_bock') {
    $row['flags'] = [
      'btn_cta' => (bool) preg_match('/\.btn\s*,\s*\.cta\b|\.cta\s*,\s*\.btn\b/', $body),
      'color_cta_vars' => (bool) preg_match('/--color-cta-/', $body),
      'mb7' => (bool) preg_match('/\.mb-7\b/', $body),
      'filters_root' => (bool) preg_match('/--filter-(white|black)\s*:/', $body),
      'header_height_root' => (bool) preg_match('/--header-height\s*:/', $body),
      'legacy_header' => (bool) preg_match('/#header\b|\.header__nav|\.navMain|\.header-v3/', $body),
      'new_header' => (bool) preg_match('/\.header-core|\.header-menu\b|\.header-search/', $body),
    ];
    $result['critical'][] = $row;
  }
  if (preg_match('/buy\s*now/i', $label) && preg_match('/--color-cta-/', $body)) {
    $result['buy_now'][] = $row;
  }
  if (preg_match_all('#/themes/custom/cookit/[^"\'\s)>]+#', $body, $m)) {
    $row['urls'] = array_values(array_unique($m[0]));
    $result['block_links'][] = $row;
  }
}

// Campos de texto em node/paragraph (corpo, HTML widget…).
$schema = $db->schema();
$tables = $db->query("SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND (TABLE_NAME LIKE 'node\\_\\_%' OR TABLE_NAME LIKE 'paragraph\\_\\_%') AND COLUMN_NAME LIKE '%\\_value' AND DATA_TYPE IN ('longtext','mediumtext','text')")->fetchAll();
foreach ($tables as $t) {
  $rows = $db->query("SELECT entity_id, {$t->COLUMN_NAME} AS v FROM {$t->TABLE_NAME} WHERE {$t->COLUMN_NAME} LIKE :p", [':p' => '%/themes/custom/cookit/%'])->fetchAll();
  foreach ($rows as $r) {
    preg_match_all('#/themes/custom/cookit/[^"\'\s)>]+#', $r->v, $m);
    $entry = ['table' => $t->TABLE_NAME, 'entity_id' => (int) $r->entity_id, 'urls' => array_values(array_unique($m[0]))];
    if (str_starts_with($t->TABLE_NAME, 'paragraph__')) {
      // Sobe até o node dono do paragraph.
      $pid = (int) $r->entity_id; $guard = 0;
      while ($guard++ < 6) {
        $p = $db->query("SELECT parent_type, parent_id FROM {paragraphs_item_field_data} WHERE id = :id", [':id' => $pid])->fetch();
        if (!$p) break;
        if ($p->parent_type === 'node') { $entry['node'] = (int) $p->parent_id; break; }
        if ($p->parent_type !== 'paragraph') { $entry['parent'] = $p->parent_type . ':' . $p->parent_id; break; }
        $pid = (int) $p->parent_id;
      }
    } else {
      $entry['node'] = (int) $r->entity_id;
    }
    if (!empty($entry['node'])) {
      $n = $db->query("SELECT title, status, type FROM {node_field_data} WHERE nid = :n LIMIT 1", [':n' => $entry['node']])->fetch();
      $entry['title'] = $n->title ?? NULL; $entry['published'] = (bool) ($n->status ?? 0); $entry['type'] = $n->type ?? NULL;
      $entry['alias'] = $aliases->getAliasByPath('/node/' . $entry['node']);
    }
    $result['content_links'][] = $entry;
  }
}

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
