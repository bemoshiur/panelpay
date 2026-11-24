<?php
/** Shared helpers of the PanelPay addon (PRO-6). No secret is logged or shown. */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

/** Every line of a top-up invoice starts with this; the panel credits only such invoices. */
const PANELPAY_TOPUP_MARKER = 'PanelPay wallet top-up';

/** "12.50" -> 1250 (cents, integer); anything else -> null. Never a float. */
function panelpay_parse_amount(string $value): ?int
{
    $value = trim($value);
    if (!preg_match('/^(0|[1-9][0-9]{0,8})(?:\.([0-9]{1,2}))?$/', $value, $m)) {
        return null;
    }
    $frac = str_pad($m[2] ?? '', 2, '0');
    return ((int) $m[1]) * 100 + (int) $frac;
}

function panelpay_format_amount(int $cents): string
{
    return intdiv($cents, 100) . '.' . str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT);
}

/**
 * The reference of a WHMCS client when the invoice is made: HMAC-SHA256(bridge secret,
 * "<client id>:<e-mail, trimmed, lower case>"), first 16 hex. The bridge recomputes it at payment and
 * refuses the credit when the client's e-mail changed in between (pro/whmcs-bridge/invoice.ts clientRef).
 */
function panelpay_client_ref(string $secret, int $clientId, string $email): string
{
    return substr(hash_hmac('sha256', $clientId . ':' . strtolower(trim($email)), $secret), 0, 16);
}

/** "PanelPay wallet top-up (USD 25.00) [ref 0123456789abcdef]": the only line format the panel credits. */
function panelpay_topup_description(string $currency, int $cents, string $ref): string
{
    return PANELPAY_TOPUP_MARKER . ' (' . preg_replace('/[^A-Z]/', '', $currency) . ' '
        . panelpay_format_amount($cents) . ') [ref ' . preg_replace('/[^0-9a-f]/', '', $ref) . ']';
}

/**
 * One addon setting, the same way in every place (client area, admin page, hooks): read from
 * tbladdonmodules; the password field is stored encrypted and decrypted here.
 */
function panelpay_setting(string $name): string
{
    $value = (string) \WHMCS\Database\Capsule::table('tbladdonmodules')
        ->where('module', 'panelpay')
        ->where('setting', $name)
        ->value('value');
    return $name === 'bridge_secret' ? (string) decrypt($value) : $value;
}

/** The panel URL if it is a plain https origin, else null. */
function panelpay_panel_url(string $url): ?string
{
    $url = rtrim(trim($url), '/');
    if (!preg_match('#^https://[a-z0-9.-]{1,253}(:[0-9]{2,5})?$#i', $url)) {
        return null;
    }
    return $url;
}

function panelpay_login_url(string $panelUrl, string $email): string
{
    $query = filter_var($email, FILTER_VALIDATE_EMAIL) ? '?email=' . rawurlencode($email) : '';
    return $panelUrl . '/en/login' . $query;
}

/** True when every line of the invoice is a top-up line. */
function panelpay_is_topup_invoice(array $invoice): bool
{
    $items = $invoice['items']['item'] ?? [];
    if (!is_array($items) || count($items) === 0) {
        return false;
    }
    foreach ($items as $item) {
        if (strpos((string) ($item['description'] ?? ''), PANELPAY_TOPUP_MARKER) !== 0) {
            return false;
        }
    }
    return true;
}

/**
 * Tells the panel that an invoice was paid. Signed with the bridge secret (HMAC-SHA256 of
 * "<timestamp>.<body>"). The panel reads the invoice from the WHMCS API itself before it credits.
 * Returns a short status for the admin page; never the secret.
 */
function panelpay_notify_panel(string $panelUrl, string $secret, string $invoiceId, string $path = 'invoice-paid'): string
{
    if ($path !== 'invoice-paid' && $path !== 'invoice-changed') {
        return 'bad_path';
    }
    $panel = panelpay_panel_url($panelUrl);
    if ($panel === null || strlen($secret) < 48) {
        return 'not_configured';
    }
    $body = json_encode(['invoiceId' => $invoiceId]);
    $timestamp = (string) time();
    $signature = hash_hmac('sha256', $timestamp . '.' . $body, $secret);
    $ch = curl_init($panel . '/bridge/whmcs/' . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-TC-Timestamp: ' . $timestamp,
            'X-TC-Signature: ' . $signature,
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 20,
    ]);
    $answer = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($answer === false || $status !== 200) {
        return 'unreachable_' . $status;
    }
    $json = json_decode((string) $answer, true);
    $kind = is_array($json) ? (string) ($json['kind'] ?? '') : '';
    return preg_match('/^[a-z_]{1,20}$/', $kind) ? $kind : 'unknown';
}
