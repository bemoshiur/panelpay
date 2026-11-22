<?php
/** Shared helpers of the TryAWS.now addon (PRO-6). No secret is logged or shown. */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

/** Every line of a top-up invoice starts with this; the panel credits only such invoices. */
const TRYAWSNOW_TOPUP_MARKER = 'TryAWS.now wallet top-up';

/** "12.50" -> 1250 (cents, integer); anything else -> null. Never a float. */
function tryawsnow_parse_amount(string $value): ?int
{
    $value = trim($value);
    if (!preg_match('/^(0|[1-9][0-9]{0,8})(?:\.([0-9]{1,2}))?$/', $value, $m)) {
        return null;
    }
    $frac = str_pad($m[2] ?? '', 2, '0');
    return ((int) $m[1]) * 100 + (int) $frac;
}

function tryawsnow_format_amount(int $cents): string
{
    return intdiv($cents, 100) . '.' . str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT);
}

function tryawsnow_topup_description(string $currency, int $cents): string
{
    return TRYAWSNOW_TOPUP_MARKER . ' (' . preg_replace('/[^A-Z]/', '', $currency) . ' ' . tryawsnow_format_amount($cents) . ')';
}

/** The panel URL if it is a plain https origin, else null. */
function tryawsnow_panel_url(string $url): ?string
{
    $url = rtrim(trim($url), '/');
    if (!preg_match('#^https://[a-z0-9.-]{1,253}(:[0-9]{2,5})?$#i', $url)) {
        return null;
    }
    return $url;
}

function tryawsnow_login_url(string $panelUrl, string $email): string
{
    $query = filter_var($email, FILTER_VALIDATE_EMAIL) ? '?email=' . rawurlencode($email) : '';
    return $panelUrl . '/en/login' . $query;
}

/** True when every line of the invoice is a top-up line. */
function tryawsnow_is_topup_invoice(array $invoice): bool
{
    $items = $invoice['items']['item'] ?? [];
    if (!is_array($items) || count($items) === 0) {
        return false;
    }
    foreach ($items as $item) {
        if (strpos((string) ($item['description'] ?? ''), TRYAWSNOW_TOPUP_MARKER) !== 0) {
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
function tryawsnow_notify_panel(string $panelUrl, string $secret, string $invoiceId): string
{
    $panel = tryawsnow_panel_url($panelUrl);
    if ($panel === null || strlen($secret) < 48) {
        return 'not_configured';
    }
    $body = json_encode(['invoiceId' => $invoiceId]);
    $timestamp = (string) time();
    $signature = hash_hmac('sha256', $timestamp . '.' . $body, $secret);
    $ch = curl_init($panel . '/bridge/whmcs/invoice-paid');
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
