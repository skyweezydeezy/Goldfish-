<?php
// Run by cron every 10 minutes (cPanel: Cron Jobs). Makes the next credential ahead of time, so players never wait for one, and checks
// usage once an hour. From the command line only. The cron command sets the secret key, for example:
//   METERED_SECRET_KEY=... /usr/local/bin/php /home/USER/public_html/turn/cron.php
if (php_sapi_name() !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/lib.php';
try {
  turn_with_state(function (&$st) {
    turn_tick($st);
    if (turn_now() - (int)$st['usageAt'] >= 3600) turn_check_usage($st);
  });
} catch (Exception $e) { turn_log('cron: ' . $e->getMessage()); fwrite(STDERR, turn_hide($e->getMessage()) . "\n"); exit(1); }
