<?php
/** PanelPay addon hooks (PRO-6). */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

require_once __DIR__ . '/lib.php';


add_hook('InvoicePaid', 1, function (array $vars) {
    panelpay_hook_notify((string) ($vars['invoiceid'] ?? ''), 'invoice-paid');
});

// Money review 2: a credited top-up that WHMCS refunds, cancels or marks unpaid again is flagged in the
// panel for an operator (the panel re-reads the invoice; it never credits on this path).
foreach (['InvoiceRefunded', 'InvoiceCancelled', 'InvoiceUnpaid'] as $hookPoint) {
    add_hook($hookPoint, 1, function (array $vars) {
        panelpay_hook_notify((string) ($vars['invoiceid'] ?? ''), 'invoice-changed');
    });
}

function panelpay_hook_notify(string $invoiceId, string $path): void
{
    if (!preg_match('/^[1-9][0-9]{0,9}$/', $invoiceId)) {
        return;
    }
    $invoice = localAPI('GetInvoice', ['invoiceid' => $invoiceId]);
    if (($invoice['result'] ?? '') !== 'success' || !panelpay_is_topup_invoice($invoice)) {
        return; // not ours: nothing is sent
    }
    $result = panelpay_notify_panel(
        panelpay_setting('panel_url'),
        panelpay_setting('bridge_secret'),
        $invoiceId,
        $path
    );
    if ($path === 'invoice-paid' && $result !== 'credited' && $result !== 'unchanged') {
        // The panel also retries on its own every 15 minutes; the admin can re-send from the addon page.
        logActivity('PanelPay: invoice #' . $invoiceId . ' not credited yet (' . $result . ')');
    }
}
