import { Button, Card, DateText, EmptyState } from "@tc/ui";
import { localePath } from "@tc/ui/runtime";
import type { Locale } from "@tc/ui/runtime";
import { useTranslations } from "next-intl";
import type { CustomerSupportThread } from "../../../../../../server/support-view.ts";
import { SupportStatusBadge } from "../RequestsContent.tsx";
import { CloseRequestForm, ReplyForm } from "./ThreadForms.tsx";
import type { ThreadAction } from "./ThreadForms.tsx";

// The content of /support/requests/[id] (WPU-Z6), after viewticket.tpl: the request (subject, type, status,
// times), then the thread oldest first (the text the customer sent, then every reply), then the reply form
// and "Close request". An entry of support is signed "PanelPay support", never with a person's name or id
// (the repository never answers one). Times are in the customer's locale and digits. Text is plain text:
// React escapes it, and a line break becomes <br>. Synchronous, so it renders in a test without a request.

type Numerals = "beng" | "latn";
type Author = CustomerSupportThread["messages"][number]["authorType"];

interface Entry {
  key: string;
  author: Author;
  body: string;
  at: Date;
}

// Final review (Z6 minors): an entry a visitor sent from the public support form (before the request was linked
// to the account) is shown neutrally: its own label and an envelope, not "You".
const AUTHOR_ICON: Record<Author, string> = {
  customer: "fas fa-user",
  visitor: "fas fa-envelope",
  admin: "fas fa-headset",
};

function Lines({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, index) => (
        <span key={index}>
          {line}
          {index < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

function ThreadEntry({ entry, numerals }: { entry: Entry; numerals: Numerals }) {
  const t = useTranslations("SupportRequests.thread.author");
  return (
    <li className="mb-4">
      <div className="d-flex flex-wrap justify-content-between align-items-baseline mb-2">
        <span className="mergecolor fw-bold">
          <i className={`${AUTHOR_ICON[entry.author] ?? "fas fa-user"} me-2`} aria-hidden="true" />
          {t.has(entry.author) ? t(entry.author) : t("customer")}
        </span>
        <span className="date mergecolor small">
          <DateText value={entry.at} variant="datetime" numerals={numerals} />
        </span>
      </div>
      <div className="bg-seccolorstyle bg-white noshadow mergecolor p-3 rounded text-break">
        <Lines text={entry.body} />
      </div>
    </li>
  );
}

export function ThreadNotFound({ locale }: { locale: Locale }) {
  const t = useTranslations("SupportRequests.notFound");
  return (
    <EmptyState
      title={t("title")}
      description={t("body")}
      action={
        <Button variant="primary" href={localePath(locale, "/support/requests")}>
          {t("back")}
        </Button>
      }
    />
  );
}

export function ThreadContent({
  locale,
  numerals,
  thread,
  replyKey,
  replyAction,
  closeAction,
}: {
  locale: Locale;
  numerals: Numerals;
  /** Null: another customer's request, a missing one or a bad id, alike (R8). */
  thread: CustomerSupportThread | null;
  /** The idempotency key of this render of the reply form (R7). */
  replyKey: string;
  replyAction: ThreadAction;
  closeAction: ThreadAction;
}) {
  const t = useTranslations("SupportRequests");
  const form = useTranslations("SupportForm");
  if (thread === null) return <ThreadNotFound locale={locale} />;

  const entries: Entry[] = [
    { key: "request", author: "customer", body: thread.message, at: thread.createdAt },
    ...thread.messages.map((m) => ({
      key: m.id,
      author: m.authorType,
      body: m.body,
      at: m.createdAt,
    })),
  ];
  const closed = thread.status === "closed";

  return (
    <>
      <p className="mb-3">
        <a className="seccolor" href={localePath(locale, "/support/requests")}>
          <i className="fas fa-arrow-left me-2" aria-hidden="true" />
          {t("thread.back")}
        </a>
      </p>
      <h1 className="h3 mergecolor mb-3 text-break">{thread.subject}</h1>
      <Card className="mb-4">
        <dl className="row mb-0">
          <dt className="col-sm-4 seccolor">{t("thread.status")}</dt>
          <dd className="col-sm-8 mergecolor">
            <SupportStatusBadge status={thread.status} />
          </dd>
          <dt className="col-sm-4 seccolor">{t("thread.category")}</dt>
          <dd className="col-sm-8 mergecolor">
            {form.has(`form.category.${thread.category}`)
              ? form(`form.category.${thread.category}`)
              : ""}
          </dd>
          <dt className="col-sm-4 seccolor">{t("thread.openedOn")}</dt>
          <dd className="col-sm-8 mergecolor">
            <DateText value={thread.createdAt} variant="datetime" numerals={numerals} />
          </dd>
          <dt className="col-sm-4 seccolor">{t("thread.lastActivity")}</dt>
          <dd className="col-sm-8 mergecolor">
            <DateText value={thread.lastActivityAt} variant="datetime" numerals={numerals} />
          </dd>
          <dt className="col-sm-4 seccolor">{t("thread.reference")}</dt>
          <dd className="col-sm-8 mergecolor mb-0">
            <code className="text-break">{thread.id}</code>
          </dd>
        </dl>
      </Card>

      {thread.hasEarlier ? <p className="seccolor small">{t("thread.earlier")}</p> : null}
      <ol className="list-unstyled mb-4">
        {entries.map((entry) => (
          <ThreadEntry key={entry.key} entry={entry} numerals={numerals} />
        ))}
      </ol>

      <Card
        className="mb-4"
        title={
          <>
            <i className="fas fa-pencil-alt me-2" aria-hidden="true" />
            {t("reply.title")}
          </>
        }
      >
        <ReplyForm
          requestId={thread.id}
          idempotencyKey={replyKey}
          closed={closed}
          action={replyAction}
        />
      </Card>
      {closed ? null : (
        <Card className="mb-4">
          <CloseRequestForm requestId={thread.id} action={closeAction} />
        </Card>
      )}
    </>
  );
}
