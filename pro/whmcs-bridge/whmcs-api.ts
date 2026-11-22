import type { WhmcsClient, WhmcsInvoice } from "./invoice";

// PRO-6. The two reads of the WHMCS API the bridge makes (GetInvoice, GetClientsDetails), server to
// server with the reseller's API credentials (an API identifier and secret of a WHMCS admin role that
// may call only these two actions). HTTPS only, no redirects, a fixed timeout. Answers are parsed field
// by field; a shape that is not the expected one is "unavailable", never a guess (R16). No answer text
// and no credential reaches a log or an error message (R14).

export interface WhmcsApi {
  getInvoice(invoiceId: string): Promise<WhmcsInvoice | null>;
  getClient(userId: string): Promise<WhmcsClient | null>;
}

export class WhmcsUnavailable extends Error {
  constructor() {
    super("whmcs: the API did not answer usably");
    this.name = "WhmcsUnavailable";
  }
}

const ID = /^[1-9][0-9]{0,9}$/;
const TIMEOUT_MS = 8000;
const MAX_ANSWER = 512 * 1024;

const str = (v: unknown): string | null =>
  typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null;

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export function whmcsApi(options: {
  readonly url: string; // https://billing.example.com (the WHMCS root)
  readonly identifier: string;
  readonly secret: string;
  readonly fetcher?: Fetcher;
}): WhmcsApi {
  const base = new URL(options.url);
  if (base.protocol !== "https:" || base.username !== "" || base.password !== "") {
    throw new TypeError("whmcs: the URL must be plain https");
  }
  const endpoint = new URL(
    "includes/api.php",
    base.href.endsWith("/") ? base.href : `${base.href}/`,
  );
  const fetcher = options.fetcher ?? fetch;

  async function call(
    action: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const body = new URLSearchParams({
      action,
      identifier: options.identifier,
      secret: options.secret,
      responsetype: "json",
      ...params,
    });
    let res: Response;
    try {
      res = await fetcher(endpoint.href, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new WhmcsUnavailable();
    }
    const text = await res.text().catch(() => "");
    if (!res.ok || text.length > MAX_ANSWER) throw new WhmcsUnavailable();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new WhmcsUnavailable();
    }
    if (typeof json !== "object" || json === null) throw new WhmcsUnavailable();
    return json as Record<string, unknown>;
  }

  return {
    async getInvoice(invoiceId) {
      if (!ID.test(invoiceId)) return null;
      const j = await call("GetInvoice", { invoiceid: invoiceId });
      if (j["result"] !== "success") return null;
      const rawItems = (j["items"] as { item?: unknown } | undefined)?.item;
      const list = Array.isArray(rawItems) ? rawItems : [];
      const items: { description: string; amount: string }[] = [];
      for (const it of list) {
        const description = str((it as Record<string, unknown>)?.["description"]);
        const amount = str((it as Record<string, unknown>)?.["amount"]);
        if (description === null || amount === null) throw new WhmcsUnavailable();
        items.push({ description, amount });
      }
      const userId = str(j["userid"]);
      const status = str(j["status"]);
      const balance = str(j["balance"]);
      const total = str(j["total"]);
      const id = str(j["invoiceid"]);
      if (
        userId === null ||
        status === null ||
        balance === null ||
        total === null ||
        id !== invoiceId
      ) {
        throw new WhmcsUnavailable();
      }
      return { invoiceId: id, userId, status, balance, total, items };
    },

    async getClient(userId) {
      if (!ID.test(userId)) return null;
      const j = await call("GetClientsDetails", { clientid: userId, stats: "false" });
      if (j["result"] !== "success") return null;
      const client = (j["client"] ?? j) as Record<string, unknown>;
      const email = str(client["email"]);
      const currencyCode = str(client["currency_code"]);
      if (email === null || currencyCode === null) throw new WhmcsUnavailable();
      return { email, currencyCode };
    },
  };
}
