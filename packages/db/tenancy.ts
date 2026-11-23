// Who owns the rows of every table (WP1-T2). Each of the 38 tables of the schema is either a tenant
// table, with the predicate that selects the rows of one customer, or a named non-tenant table.
// test/tenancy.test.ts compares both lists with the tables of the real schema, so a table that
// is added without a classification here fails the build.
//
// A predicate names the table as `t` and the customer id as `$1`. The text is written in this file
// only: table names and predicates never come from input (R11), and the customer id is always a
// bound parameter (R8). Both exports are frozen. Internal to packages/db; @tc/db/testing re-exports
// both lists for tests. A predicate may hold `or`: wrap it in parentheses wherever it is spliced into
// a longer condition.
//
// Rows that point at a customer's rows (ruling D16). The database has no composite foreign key
// (resource_id, customer_id), so a row with customer_id = B can point at a resource, a parent
// resource, an order or a ledger transaction of customer A. The snapshot is the oracle of every
// cross-tenant proof, and a row it cannot see is a leak the proof cannot detect. So a table with a
// customer_id column that also points at a row of an owned table is selected by its own customer_id
// or by the owner of the row it points at. Such a row is in the snapshot of both customers; if that
// is more than needed, a before/after check is stricter, never weaker.

// The row has a customer_id column.
const OWN = "t.customer_id = $1::uuid";
// The row belongs to a resource, and the resource to a customer.
const VIA_RESOURCE =
  "exists (select 1 from resources p where p.id = t.resource_id and p.customer_id = $1::uuid)";
// The row has a customer_id column, or it points at a resource, a parent resource, an order or a
// ledger transaction of the customer. The transaction is the customer's when one of its entries is on
// an account of the customer.
const OWN_OR_RESOURCE = `${OWN} or ${VIA_RESOURCE}`;
const OWN_OR_RELATED_RESOURCE = `${OWN} or exists (select 1 from resources p where p.id = t.related_resource_id and p.customer_id = $1::uuid)`;
const OWN_OR_PARENT_RESOURCE = `${OWN} or exists (select 1 from resources p where p.id = t.parent_resource_id and p.customer_id = $1::uuid)`;
const OWN_OR_ORDER = `${OWN} or exists (select 1 from orders o where o.id = t.order_id and o.customer_id = $1::uuid)`;
const OWN_OR_LEDGER_TRANSACTION = `${OWN} or exists (select 1 from ledger_entries e join ledger_accounts a on a.id = e.account_id where e.transaction_id = t.ledger_transaction_id and a.customer_id = $1::uuid)`;
// WPU-Z5: the row is a message of a support request, and the request belongs to the customer (the same
// one-step path as VIA_RESOURCE: the request's own customer, not the owner of its related resource).
const VIA_SUPPORT_REQUEST =
  "exists (select 1 from support_requests r where r.id = t.request_id and r.customer_id = $1::uuid)";

export const TENANT_TABLES: Readonly<Record<string, string>> = Object.freeze({
  customers: "t.id = $1::uuid",
  kyc_submissions: OWN,
  ssh_keys: OWN,
  otp_challenges: OWN,
  legal_acceptances: OWN,
  wallets: OWN,
  ledger_accounts: OWN,
  ledger_entries:
    "exists (select 1 from ledger_accounts a where a.id = t.account_id and a.customer_id = $1::uuid)",
  ledger_transactions:
    "exists (select 1 from ledger_entries e join ledger_accounts a on a.id = e.account_id where e.transaction_id = t.id and a.customer_id = $1::uuid)",
  wallet_adjustments: OWN_OR_LEDGER_TRANSACTION,
  payments: OWN_OR_LEDGER_TRANSACTION,
  orders: OWN_OR_LEDGER_TRANSACTION,
  // WPU-I2: an invoice also points at the ledger transaction of its charge.
  invoices: `${OWN_OR_ORDER} or exists (select 1 from ledger_entries e join ledger_accounts a on a.id = e.account_id where e.transaction_id = t.ledger_transaction_id and a.customer_id = $1::uuid)`,
  customer_homes: OWN,
  resources: OWN_OR_PARENT_RESOURCE,
  subscriptions: OWN_OR_RESOURCE,
  operations: VIA_RESOURCE,
  usage_records: VIA_RESOURCE,
  domains: OWN_OR_RESOURCE,
  dns_zones: OWN_OR_RESOURCE,
  notifications: OWN,
  waitlist_entries: OWN,
  support_requests: OWN_OR_RELATED_RESOURCE,
  support_messages: VIA_SUPPORT_REQUEST,
  abuse_cases: VIA_RESOURCE,
  audit_log: "t.actor_type = 'customer' and t.actor_id = $1::uuid",
  // The id is compared as text, written the way uuid::text writes it, so that the case of the id
  // that was passed in cannot matter; a value that is no uuid is refused by the cast, as in the
  // other predicates.
  settings: "t.scope = 'customer' and t.scope_id = $1::uuid::text",
  // A row belongs to a customer when its key starts with `customer:<id>:`; phone and IP rows belong
  // to nobody and are in no snapshot. The id is compared as text, as for settings.
  rate_limits: "starts_with(t.scope_key, 'customer:' || $1::uuid::text || ':')",
});

// The tables that no single customer owns, and why:
//   markets           the currency, gateway and top-up limits of a market, shared by its customers
//   fx_rates          the exchange rate of a market, set by an admin
//   pricing_rules     the price steps of a market and product family, set by an admin
//   catalog_products  the catalog of AWS products, synced from AWS
//   tlds              the TLD prices, synced from Route 53
//   feature_flags     the switches of a market, set by an admin
//   admin_users       the staff accounts of the admin app, not customers
//   pool_accounts     TiCON's own AWS pool accounts
//   pool_capacity     the quota and use of the pool accounts per Region
//   discrepancies     admin reconciliation data
//
// Known blind spots of the snapshot, one per line, with the work package that adds the path:
//   - notifications, waitlist_entries, support_requests with a null customer_id name the customer by e-mail: WP5-T5, WP4-T3, WP9-T4
//     (and the support_messages of such a request of a visitor: WPU-Z5)
//   - audit_log rows ABOUT a customer, written by an admin or the system (the predicate is the actor path only): WP8-T1
//   - ledger_transactions whose actor or reference is the customer but that have no line on its account: WP3-T4
//   - discrepancies, whose details can name a customer or a payment, and which customers cannot read: WP7-T6, WP8-T7
//
// The system module repositories/system/payments.ts (WP3-T2, open point 4) reads the tenant table
// `payments` by merchant_transaction_id or by status, with no customer id, and writes `discrepancies`.
// It is the one exception to customerRepos for payments: it is not reachable from customerRepos, no
// function of it takes a customer id, and test/payments-system.test.ts pins both.
//
// The system module repositories/system/registration.ts (WP2-T2) creates the customers row, which
// has no customer id until it exists: it inserts into the tenant tables customers, legal_acceptances,
// wallets and ledger_accounts and reads customers by cognito_sub (the replay case). It is the second
// exception to customerRepos, not reachable from it, no function of it takes a customer id, and only
// packages/auth calls it (tests/repo/auth-boundaries.test.mjs).
//
// The system module repositories/system/whmcs.ts (PRO-6, Pro edition only) reads the tenant table
// `customers` (with `markets`) by the verified e-mail of a WHMCS client, with no customer id, to find
// whose wallet a paid WHMCS invoice credits. Not reachable from customerRepos, no function of it takes
// a customer id (test/whmcs-system.test.ts), and only pro/whmcs-bridge calls it.
export const NON_TENANT_TABLES: readonly string[] = Object.freeze([
  "markets",
  "fx_rates",
  "pricing_rules",
  "catalog_products",
  "tlds",
  "feature_flags",
  "admin_users",
  "pool_accounts",
  "pool_capacity",
  "discrepancies",
]);
