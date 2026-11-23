<?php
/* ICEYfish relay (TURN) service for "Play a friend", in PHP for shared hosting (cPanel). The same job as server/turn-service.js.

   The Metered secret key is read from the METERED_SECRET_KEY environment variable and never sent to a browser or written to a log.
   Each credential expires 24 hours after it is made (Metered cuts it off at once, even mid-game); a new one is made every 12 hours
   and handed out once Metered has had its 2 minutes to spread it, so the one a browser gets has about 12 hours left. One credential
   is shared at a time: Metered caps how many can be active.

   Files: ice.php (the ICE servers, for the allowed site), healthz.php, usage.php (with the admin token), cron.php (run by cron:
   makes the next credential ahead of time and checks usage every hour). This file and cron.php cannot be opened from the web
   (.htaccess), and neither can data/, where the current credentials and usage are kept.

   Settings (environment; on shared hosting with SetEnv in .htaccess for the web pages, and in the cron command for cron.php):
     METERED_SECRET_KEY  required
     METERED_APP         the Metered app name (default ICEYfish): the API is https://<app>.metered.live
     ALLOWED_ORIGINS     the sites that may ask for the ICE servers, comma-separated (default https://skyweezydeezy.github.io)
     ADMIN_TOKEN         when set, usage.php with the header "X-Admin-Token: <token>" shows usage per credential
   PHP 7.4 or later, with the curl extension. */

const TURN_LIFETIME = 86400;          // a credential's life: 24 hours
const TURN_ROTATE = 43200;            // a new one every 12 hours
const TURN_PROPAGATE = 120;           // Metered's time to spread a new one
const TURN_LABEL = 'iceyfish-';

function turn_env($k, $d = null) {
  foreach (array($k, 'REDIRECT_' . $k) as $n) {          // Apache renames SetEnv values after a rewrite
    $v = getenv($n);
    if ($v !== false && $v !== '') return $v;
    if (isset($_SERVER[$n]) && $_SERVER[$n] !== '') return $_SERVER[$n];
  }
  return $d;
}
function turn_now() { $t = turn_env('TURN_TEST_NOW'); return $t !== null ? (int)$t : time(); }          // TURN_TEST_NOW: the tests' clock
function turn_secret() { $s = turn_env('METERED_SECRET_KEY'); if (!$s) throw new RuntimeException('METERED_SECRET_KEY is not set'); return $s; }
function turn_api() { return rtrim(turn_env('METERED_API_BASE', 'https://' . strtolower(turn_env('METERED_APP', 'ICEYfish')) . '.metered.live'), '/'); }
function turn_hide($s) { $k = turn_env('METERED_SECRET_KEY'); return $k ? str_replace($k, '***', (string)$s) : (string)$s; }
function turn_dir() { return turn_env('TURN_DATA_DIR', __DIR__ . '/data'); }

function turn_http($method, $url, $body = null) {
  $ch = curl_init($url);
  $o = array(CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 8);
  if ($body !== null) { $o[CURLOPT_POSTFIELDS] = json_encode($body); $o[CURLOPT_HTTPHEADER] = array('Content-Type: application/json'); }
  curl_setopt_array($ch, $o);
  $text = curl_exec($ch);
  if ($text === false) { $e = curl_error($ch); curl_close($ch); throw new RuntimeException('network: ' . turn_hide($e)); }
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  $data = json_decode($text, true);
  return array($code, $data === null ? $text : $data);
}
// A call to the Metered API with the secret key. Errors never carry the key, even when Metered repeats the URL back.
function turn_call($method, $path, $query = array(), $body = null) {
  $query['secretKey'] = turn_secret();
  list($code, $data) = turn_http($method, turn_api() . $path . '?' . http_build_query($query), $body);
  if ($code < 200 || $code >= 300) throw new RuntimeException("Metered $method $path: $code " . substr(turn_hide(is_string($data) ? $data : json_encode($data)), 0, 300));
  return $data;
}

// ---------- the saved state: data/state.json, read and written under a lock ----------
function turn_with_state($f) {
  $dir = turn_dir();
  if (!is_dir($dir)) mkdir($dir, 0700, true);
  if (!file_exists("$dir/.htaccess")) file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");
  $lock = fopen("$dir/state.lock", 'c');
  flock($lock, LOCK_EX);
  try {
    $raw = @file_get_contents("$dir/state.json");
    $st = $raw ? json_decode($raw, true) : null;
    if (!is_array($st)) $st = array('creds' => array(), 'usage' => null, 'usageAt' => 0);
    $r = $f($st);
    $tmp = "$dir/state.json." . getmypid();
    file_put_contents($tmp, json_encode($st));
    rename($tmp, "$dir/state.json");
    return $r;
  } finally { flock($lock, LOCK_UN); fclose($lock); }
}
function turn_log($line) { @file_put_contents(turn_dir() . '/turn.log', gmdate('c') . ' ' . turn_hide($line) . "\n", FILE_APPEND); }

// ---------- credentials ----------
function turn_label($t) { return TURN_LABEL . gmdate('Y-m-d\TH:i', $t) . 'Z'; }
// The ICE servers for a credential, as Metered gives them for its apiKey (the credential's own, front-end-safe key); if that fails,
// the list Metered's docs recommend, with the credential's username and password.
function turn_ice_for($c) {
  try {
    list($code, $list) = turn_http('GET', turn_api() . '/api/v1/turn/credentials?' . http_build_query(array('apiKey' => $c['apiKey'])));
    if ($code === 200 && is_array($list) && count($list) && isset($list[0]['urls'])) return $list;
  } catch (Exception $e) { turn_log('ICE servers from Metered failed, using the documented list: ' . $e->getMessage()); }
  $t = array('username' => $c['username'], 'credential' => $c['password']);
  return array(array('urls' => 'stun:stun.relay.metered.ca:80'),
    array('urls' => 'turn:global.relay.metered.ca:80') + $t, array('urls' => 'turn:global.relay.metered.ca:80?transport=tcp') + $t,
    array('urls' => 'turn:global.relay.metered.ca:443') + $t, array('urls' => 'turns:global.relay.metered.ca:443?transport=tcp') + $t);
}
function turn_live($st) { $now = turn_now(); return array_values(array_filter($st['creds'], function ($c) use ($now) { return $c['expires'] > $now; })); }
function turn_create(&$st) {
  $t = turn_now(); $label = turn_label($t);
  $d = turn_call('POST', '/api/v1/turn/credential', array(), array('expiryInSeconds' => TURN_LIFETIME, 'label' => $label));
  if (!is_array($d) || empty($d['username']) || empty($d['password']) || empty($d['apiKey'])) throw new RuntimeException('Metered did not return a credential');
  $c = array('username' => $d['username'], 'password' => $d['password'], 'apiKey' => $d['apiKey'], 'label' => $label, 'created' => $t, 'expires' => $t + TURN_LIFETIME);
  $c['ice'] = turn_ice_for($c);
  $st['creds'][] = $c;
  turn_log("credential {$c['username']} ($label) made; it expires " . gmdate('c', $c['expires']));
  return $c;
}
// drop the expired ones, and make a new one when the newest is 12 hours old (or there is none)
function turn_tick(&$st) {
  $st['creds'] = turn_live($st);
  $newest = 0; foreach ($st['creds'] as $c) $newest = max($newest, $c['created']);
  if (!$st['creds'] || turn_now() - $newest >= TURN_ROTATE) turn_create($st);
}
// the one handed out: the newest that Metered has had time to spread and that is still good
function turn_current($st) {
  $best = null; $now = turn_now();
  foreach (turn_live($st) as $c) if ($now - $c['created'] >= TURN_PROPAGATE && (!$best || $c['created'] > $best['created'])) $best = $c;
  return $best;
}
// Usage: the account against its quota, and each credential still in use. A warning in the log past 80% of the quota.
function turn_check_usage(&$st) {
  $u = array('account' => turn_call('GET', '/api/v1/turn/current_usage'), 'byUser' => array(), 'at' => gmdate('c', turn_now()));
  foreach (turn_live($st) as $c) {
    $x = turn_call('GET', '/api/v1/turn/current_usage_for_user', array('username' => $c['username']));
    $u['byUser'][$c['username']] = array('label' => $c['label'], 'usageInGB' => is_array($x) && isset($x['usageInGB']) ? $x['usageInGB'] : null, 'expires' => gmdate('c', $c['expires']));
  }
  $st['usage'] = $u; $st['usageAt'] = turn_now();
  $a = $u['account'];
  $line = 'usage: account ' . ($a['usageInGB'] ?? '?') . ' of ' . ($a['quotaInGB'] ?? '?') . ' GB';
  foreach ($u['byUser'] as $x) $line .= "; {$x['label']} {$x['usageInGB']} GB";
  turn_log($line);
  if (!empty($a['quotaInGB']) && $a['usageInGB'] / $a['quotaInGB'] >= 0.8) turn_log('WARNING usage is at ' . round($a['usageInGB'] / $a['quotaInGB'] * 100) . '% of the ' . $a['quotaInGB'] . ' GB quota');
  return $u;
}

// ---------- answers ----------
function turn_json($code, $body, $headers = array()) {
  http_response_code($code);
  header('Content-Type: application/json');
  header('Cache-Control: no-store');
  header('X-Content-Type-Options: nosniff');
  foreach ($headers as $k => $v) header("$k: $v");
  echo json_encode($body);
  exit;
}
