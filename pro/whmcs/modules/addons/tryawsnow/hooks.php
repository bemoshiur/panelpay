<?php
/** TryAWS.now addon hooks (PRO-6). */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

require_once __DIR__ . '/lib.php';

use WHMCS\Database\Capsule;

add_hook('InvoicePaid', 1, function (array $vars) {
    $invoiceId = (string) ($vars['invoiceid'] ?? '');
    if (!preg_match('/^[1-9][0-9]{0,9}$/', $invoiceId)) {
        return;
    }
    $invoice = localAPI('GetInvoice', ['invoiceid' => $invoiceId]);
    if (($invoice['result'] ?? '') !== 'success' || !tryawsnow_is_topup_invoice($invoice)) {
        return; // not ours: nothing is sent
    }
    $settings = Capsule::table('tbladdonmodules')
        ->where('module', 'tryawsnow')
        ->pluck('value', 'setting');
    $result = tryawsnow_notify_panel(
        (string) ($settings['panel_url'] ?? ''),
        (string) decrypt((string) ($settings['bridge_secret'] ?? '')),
        $invoiceId
    );
    if ($result !== 'credited' && $result !== 'unchanged') {
        // The admin re-sends from Addons > TryAWS.now Panel once the cause is fixed.
        logActivity('TryAWS.now: invoice #' . $invoiceId . ' not credited yet (' . $result . ')');
    }
});
