<?php
// Is the relay ready? Says when the credential handed out expires, and nothing secret.
require __DIR__ . '/lib.php';
$c = turn_with_state(function (&$st) { return array(turn_current($st), count($st['creds'])); });
turn_json(200, array('ok' => (bool)$c[0], 'credentials' => $c[1], 'expires' => $c[0] ? gmdate('c', $c[0]['expires']) : null, 'secretKeySet' => (bool)turn_env('METERED_SECRET_KEY')));
