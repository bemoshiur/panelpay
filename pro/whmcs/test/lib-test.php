<?php
// php pro/whmcs/test/lib-test.php — tests of the addon's pure helpers (no WHMCS needed).
define('WHMCS', true);
require __DIR__ . '/../modules/addons/panelpay/lib.php';

$fails = 0;
function check($name, $got, $want) {
    global $fails;
    if ($got !== $want) { $fails++; echo "FAIL $name: got " . var_export($got, true) . " want " . var_export($want, true) . "\n"; }
}
check('parse 25.00', panelpay_parse_amount('25.00'), 2500);
check('parse 12.5', panelpay_parse_amount('12.5'), 1250);
check('parse 7', panelpay_parse_amount('7'), 700);
foreach (['-1', '1.005', '1e3', '', '01.00', '1,000'] as $bad) check("parse $bad", panelpay_parse_amount($bad), null);
check('format', panelpay_format_amount(1205), '12.05');
check('description', panelpay_topup_description('USD', 2500, '0123456789abcdef'), 'PanelPay wallet top-up (USD 25.00) [ref 0123456789abcdef]');
// The client reference the bridge recomputes (pro/whmcs-bridge/invoice.ts clientRef): printed for the cross-check.
echo 'REF ' . panelpay_client_ref(str_repeat('s', 48), 7, ' Buyer@Example.test') . "\n";
check('panel ok', panelpay_panel_url('https://panel.example.com/'), 'https://panel.example.com');
check('panel http', panelpay_panel_url('http://panel.example.com'), null);
check('panel path', panelpay_panel_url('https://panel.example.com/x?y'), null);
check('login', panelpay_login_url('https://p.example.com', 'a+b@example.com'), 'https://p.example.com/en/login?email=a%2Bb%40example.com');
check('login bad email', panelpay_login_url('https://p.example.com', '"><x>'), 'https://p.example.com/en/login');
check('topup only', panelpay_is_topup_invoice(['items' => ['item' => [['description' => 'PanelPay wallet top-up (USD 5.00)']]]]), true);
check('mixed', panelpay_is_topup_invoice(['items' => ['item' => [['description' => 'PanelPay wallet top-up'], ['description' => 'Hosting']]]]), false);
check('empty', panelpay_is_topup_invoice(['items' => ['item' => []]]), false);
// The signature the bridge checks (pro/whmcs-bridge/server.ts sign()): printed for the cross-check.
echo 'SIG ' . hash_hmac('sha256', '1764547200.{"invoiceId":"1001"}', str_repeat('s', 48)) . "\n";
echo $fails === 0 ? "OK\n" : "FAILED $fails\n";
exit($fails === 0 ? 0 : 1);
