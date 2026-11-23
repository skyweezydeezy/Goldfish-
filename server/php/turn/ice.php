<?php
// The ICE servers for "Play a friend": only for the allowed site, at most 30 requests per address in 10 minutes. If cron has not run,
// the credential is made or renewed here when it is due.
require __DIR__ . '/lib.php';

$origins = array_filter(array_map(function ($s) { return rtrim(trim($s), '/'); }, explode(',', turn_env('ALLOWED_ORIGINS', 'https://skyweezydeezy.github.io'))));
$origin = rtrim(isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '', '/');
$cors = in_array($origin, $origins, true) ? array('Access-Control-Allow-Origin' => $origin, 'Vary' => 'Origin') : array();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code($cors ? 204 : 403);
  foreach ($cors + array('Access-Control-Allow-Methods' => 'GET', 'Access-Control-Max-Age' => '86400') as $k => $v) header("$k: $v");
  exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'GET') turn_json(405, array('error' => 'GET only'));
if (!$cors) turn_json(403, array('error' => 'not an allowed site'));

// the per-address limit: a hash of the address, forgotten after 10 minutes
$dir = turn_dir();
if (!is_dir($dir)) mkdir($dir, 0700, true);
$ip = hash('sha256', isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '?');
$fh = fopen("$dir/hits.json", 'c+'); flock($fh, LOCK_EX);
$hits = json_decode(stream_get_contents($fh), true); if (!is_array($hits)) $hits = array();
$now = turn_now();
foreach ($hits as $k => $ts) { $hits[$k] = array_values(array_filter($ts, function ($t) use ($now) { return $now - $t < 600; })); if (!$hits[$k]) unset($hits[$k]); }
$hits[$ip][] = $now;
$over = count($hits[$ip]) > 30;
ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($hits)); flock($fh, LOCK_UN); fclose($fh);
if ($over) turn_json(429, array('error' => 'too many requests'), $cors + array('Retry-After' => '600'));

try {
  $c = turn_with_state(function (&$st) { turn_tick($st); return turn_current($st); });
} catch (Exception $e) {
  turn_log('ice.php: ' . $e->getMessage());
  turn_json(502, array('error' => 'the relay service could not reach Metered'), $cors);
}
if (!$c) turn_json(503, array('error' => 'the relay is getting ready; try again in a few minutes'), $cors + array('Retry-After' => '120'));
turn_json(200, array('iceServers' => $c['ice'], 'expires' => gmdate('c', $c['expires'])), $cors);
