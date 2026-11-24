<?php
/**
 * PanelPay Pro: WHMCS addon (PRO-6).
 *
 * - Client area (index.php?m=panelpay): "Open panel" (the panel's sign-in page with the client's e-mail
 *   filled in) and "Top up wallet" (creates a WHMCS invoice the client pays with any gateway of this
 *   WHMCS; the panel credits its wallet after it has read the paid invoice from the WHMCS API itself).
 * - Admin page: re-send one paid invoice to the panel (when the hook could not reach it).
 * - hooks.php: on InvoicePaid, tells the panel which invoice was paid (signed, decides no money).
 *
 * Owner decisions of 23 Nov 2026: sign-in through the panel's own login page (no new sign-in system);
 * money through WHMCS invoices checked server to server.
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

require_once __DIR__ . '/lib.php';

use WHMCS\Database\Capsule;

function panelpay_config()
{
    return [
        'name' => 'PanelPay Panel',
        'description' => 'Lets clients open their PanelPay panel and top up its wallet with a WHMCS invoice.',
        'author' => 'TiCON System Limited',
        'language' => 'english',
        'version' => '1.0.0',
        'fields' => [
            'panel_url' => [
                'FriendlyName' => 'Panel URL',
                'Type' => 'text',
                'Size' => '60',
                'Description' => 'https://panel.example.com (the customer panel of your PanelPay Pro box)',
            ],
            'bridge_secret' => [
                'FriendlyName' => 'Bridge secret',
                'Type' => 'password',
                'Size' => '60',
                'Description' => 'From /etc/tc/bridge-secret.txt on the box (root only)',
            ],
            'min_topup' => [
                'FriendlyName' => 'Smallest top-up',
                'Type' => 'text',
                'Size' => '10',
                'Default' => '5.00',
            ],
            'max_topup' => [
                'FriendlyName' => 'Largest top-up',
                'Type' => 'text',
                'Size' => '10',
                'Default' => '1000.00',
            ],
        ],
    ];
}

function panelpay_activate()
{
    return ['status' => 'success', 'description' => 'PanelPay Panel is active. Set the panel URL and the bridge secret.'];
}

function panelpay_deactivate()
{
    return ['status' => 'success', 'description' => 'PanelPay Panel is inactive.'];
}

/** Client area page: index.php?m=panelpay */
function panelpay_clientarea($vars)
{
    $clientId = (int) ($_SESSION['uid'] ?? 0);
    if ($clientId <= 0) {
        return ['pagetitle' => 'PanelPay', 'templatefile' => 'clientarea', 'requirelogin' => true, 'vars' => []];
    }
    $client = localAPI('GetClientsDetails', ['clientid' => $clientId, 'stats' => false]);
    $email = (string) ($client['email'] ?? '');
    $currency = (string) ($client['currency_code'] ?? '');
    $panelUrl = panelpay_panel_url(panelpay_setting('panel_url'));
    $secret = panelpay_setting('bridge_secret');
    $error = '';

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && isset($_POST['topup_amount'])) {
        check_token('WHMCS.default');
        $amount = panelpay_parse_amount((string) $_POST['topup_amount']);
        $min = panelpay_parse_amount((string) ($vars['min_topup'] ?? '5.00'));
        $max = panelpay_parse_amount((string) ($vars['max_topup'] ?? '1000.00'));
        if ($amount === null || $min === null || $max === null || $amount < $min || $amount > $max) {
            $error = 'invalid_amount';
        } elseif (strlen($secret) < 48 || !preg_match('/^[A-Z]{3}$/', $currency) || $email === '') {
            $error = 'not_configured';
        } else {
            $invoice = localAPI('CreateInvoice', [
                'userid' => $clientId,
                'status' => 'Unpaid',
                'sendinvoice' => true,
                'itemdescription1' => panelpay_topup_description(
                    $currency,
                    $amount,
                    panelpay_client_ref($secret, $clientId, $email)
                ),
                'itemamount1' => panelpay_format_amount($amount),
                'itemtaxed1' => false,
            ]);
            if (($invoice['result'] ?? '') === 'success') {
                header('Location: viewinvoice.php?id=' . (int) $invoice['invoiceid']);
                exit;
            }
            $error = 'invoice_failed';
        }
    }

    return [
        'pagetitle' => 'PanelPay Panel',
        'breadcrumb' => ['index.php?m=panelpay' => 'PanelPay Panel'],
        'templatefile' => 'clientarea',
        'requirelogin' => true,
        'forcessl' => true,
        'vars' => [
            'openPanelUrl' => $panelUrl === null ? '' : panelpay_login_url($panelUrl, $email),
            'currency' => $currency,
            'minTopup' => $vars['min_topup'] ?? '5.00',
            'maxTopup' => $vars['max_topup'] ?? '1000.00',
            'error' => $error,
        ],
    ];
}

/** Admin page: re-send one invoice to the panel. */
function panelpay_output($vars)
{
    $message = '';
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && isset($_POST['invoice_id'])) {
        check_token('WHMCS.admin.default');
        $invoiceId = (string) $_POST['invoice_id'];
        if (!preg_match('/^[1-9][0-9]{0,9}$/', $invoiceId)) {
            $message = 'Not an invoice number.';
        } else {
            $result = panelpay_notify_panel(
                panelpay_setting('panel_url'),
                panelpay_setting('bridge_secret'),
                $invoiceId
            );
            $message = 'Panel answer: ' . htmlspecialchars($result, ENT_QUOTES);
        }
    }
    $token = generate_token('form');
    echo '<p>Re-send a paid top-up invoice to the PanelPay panel. The panel credits it once at most.</p>';
    if ($message !== '') {
        echo '<div class="alert alert-info">' . $message . '</div>';
    }
    echo '<form method="post">' . $token
        . '<input type="text" name="invoice_id" pattern="[0-9]+" required class="form-control" style="max-width:200px"> '
        . '<button type="submit" class="btn btn-primary">Re-send</button></form>';
}
