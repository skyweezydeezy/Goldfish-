<?php
// Usage per credential and for the account (as of the last check by cron.php), for whoever sends the header X-Admin-Token: <ADMIN_TOKEN>.
require __DIR__ . '/lib.php';
$admin = turn_env('ADMIN_TOKEN');
$got = isset($_SERVER['HTTP_X_ADMIN_TOKEN']) ? $_SERVER['HTTP_X_ADMIN_TOKEN'] : '';
if (!$admin || !hash_equals($admin, $got)) turn_json(401, array('error' => 'not allowed'));
$u = turn_with_state(function (&$st) { return $st['usage']; });
turn_json(200, $u ? $u : array('error' => 'no usage checked yet: cron.php has not run'));
