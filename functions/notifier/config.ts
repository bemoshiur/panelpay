// Non-secret settings of the notifier, from the environment of the Lambda (infra/stacks/workers.ts).
// Fail closed (R16) with one fixed message that holds no value (R3, R14).

export const NOTIFIER_CONFIG_ERROR = "notifier: the configuration is not valid";

export interface NotifierConfig {
  // https origin of the panel; the links in a message are built from it (16.14).
  readonly panelOrigin: string;
  // "PanelPay <no-reply@...>" or a bare address: the verified identity of SES.
  readonly sesFrom: string;
}

const ORIGIN = /^https:\/\/[a-z0-9.-]+(:[0-9]{2,5})?$/i;
// A display name of letters, digits, spaces and . - ' , then an address; no control character, no angle
// bracket inside the name, so a header cannot be injected.
const FROM =
  /^(?:[A-Za-z0-9 .'-]+ <[^\s@<>,;"\\]+@[^\s@<>,;"\\]+\.[^\s@<>,;"\\]+>|[^\s@<>,;"\\]+@[^\s@<>,;"\\]+\.[^\s@<>,;"\\]+)$/;

export function readNotifierConfig(
  env: Readonly<Record<string, string | undefined>>,
): NotifierConfig {
  const panelOrigin = env.PANEL_ORIGIN;
  const sesFrom = env.SES_FROM;
  if (
    panelOrigin === undefined ||
    !ORIGIN.test(panelOrigin) ||
    sesFrom === undefined ||
    !FROM.test(sesFrom)
  ) {
    throw new Error(NOTIFIER_CONFIG_ERROR);
  }
  return { panelOrigin, sesFrom };
}
