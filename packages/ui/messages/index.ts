import type { Locale } from "../components/types.ts";

import bn_badge from "./bn/badge.json" with { type: "json" };
import bn_button from "./bn/button.json" with { type: "json" };
import bn_common from "./bn/common.json" with { type: "json" };
import bn_confirmDestroy from "./bn/confirmDestroy.json" with { type: "json" };
import bn_copy from "./bn/copy.json" with { type: "json" };
import bn_dataTable from "./bn/dataTable.json" with { type: "json" };
import bn_field from "./bn/field.json" with { type: "json" };
import bn_locale from "./bn/locale.json" with { type: "json" };
import bn_plan from "./bn/plan.json" with { type: "json" };
import bn_priceBreakdown from "./bn/priceBreakdown.json" with { type: "json" };
import bn_secret from "./bn/secret.json" with { type: "json" };
import bn_states from "./bn/states.json" with { type: "json" };
import bn_summary from "./bn/summary.json" with { type: "json" };
import bn_timeline from "./bn/timeline.json" with { type: "json" };
import bn_toast from "./bn/toast.json" with { type: "json" };
import bn_wallet from "./bn/wallet.json" with { type: "json" };
import en_badge from "./en/badge.json" with { type: "json" };
import en_button from "./en/button.json" with { type: "json" };
import en_common from "./en/common.json" with { type: "json" };
import en_confirmDestroy from "./en/confirmDestroy.json" with { type: "json" };
import en_copy from "./en/copy.json" with { type: "json" };
import en_dataTable from "./en/dataTable.json" with { type: "json" };
import en_field from "./en/field.json" with { type: "json" };
import en_locale from "./en/locale.json" with { type: "json" };
import en_plan from "./en/plan.json" with { type: "json" };
import en_priceBreakdown from "./en/priceBreakdown.json" with { type: "json" };
import en_secret from "./en/secret.json" with { type: "json" };
import en_states from "./en/states.json" with { type: "json" };
import en_summary from "./en/summary.json" with { type: "json" };
import en_timeline from "./en/timeline.json" with { type: "json" };
import en_toast from "./en/toast.json" with { type: "json" };
import en_wallet from "./en/wallet.json" with { type: "json" };
import id_badge from "./id/badge.json" with { type: "json" };
import id_button from "./id/button.json" with { type: "json" };
import id_common from "./id/common.json" with { type: "json" };
import id_confirmDestroy from "./id/confirmDestroy.json" with { type: "json" };
import id_copy from "./id/copy.json" with { type: "json" };
import id_dataTable from "./id/dataTable.json" with { type: "json" };
import id_field from "./id/field.json" with { type: "json" };
import id_locale from "./id/locale.json" with { type: "json" };
import id_plan from "./id/plan.json" with { type: "json" };
import id_priceBreakdown from "./id/priceBreakdown.json" with { type: "json" };
import id_secret from "./id/secret.json" with { type: "json" };
import id_states from "./id/states.json" with { type: "json" };
import id_summary from "./id/summary.json" with { type: "json" };
import id_timeline from "./id/timeline.json" with { type: "json" };
import id_toast from "./id/toast.json" with { type: "json" };
import id_wallet from "./id/wallet.json" with { type: "json" };

/** One level under `kit`: group name to key to text. */
export type KitMessages = { kit: Record<string, Record<string, unknown>> };

/** Merges the group files into one object; a group that appears twice is a defect (R16: fail closed). */
export function mergeKit(parts: readonly KitMessages[]): KitMessages {
  const kit: Record<string, Record<string, unknown>> = {};
  for (const part of parts) {
    for (const [group, value] of Object.entries(part.kit)) {
      if (group in kit) throw new Error(`kit message group "${group}" is defined twice`);
      kit[group] = value;
    }
  }
  return { kit };
}

const bnParts: KitMessages[] = [
  bn_badge,
  bn_button,
  bn_common,
  bn_confirmDestroy,
  bn_copy,
  bn_dataTable,
  bn_field,
  bn_locale,
  bn_plan,
  bn_priceBreakdown,
  bn_secret,
  bn_states,
  bn_summary,
  bn_timeline,
  bn_toast,
  bn_wallet,
];

const enParts: KitMessages[] = [
  en_badge,
  en_button,
  en_common,
  en_confirmDestroy,
  en_copy,
  en_dataTable,
  en_field,
  en_locale,
  en_plan,
  en_priceBreakdown,
  en_secret,
  en_states,
  en_summary,
  en_timeline,
  en_toast,
  en_wallet,
];

const idParts: KitMessages[] = [
  id_badge,
  id_button,
  id_common,
  id_confirmDestroy,
  id_copy,
  id_dataTable,
  id_field,
  id_locale,
  id_plan,
  id_priceBreakdown,
  id_secret,
  id_states,
  id_summary,
  id_timeline,
  id_toast,
  id_wallet,
];

export const kitMessages: Record<Locale, KitMessages> & { readonly id: KitMessages } = {
  bn: mergeKit(bnParts),
  en: mergeKit(enParts),
  id: mergeKit(idParts),
};

/** The kit messages of one locale, for the app to put under NextIntlClientProvider. */
export function loadKitMessages(locale: Locale | "id" | (string & {})): KitMessages {
  if (locale !== "bn" && locale !== "en" && locale !== "id") {
    throw new RangeError(`unknown locale ${JSON.stringify(locale)}; expected "bn", "en" or "id"`);
  }
  return kitMessages[locale as Locale | "id"];
}
