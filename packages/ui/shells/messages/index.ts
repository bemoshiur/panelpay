import type { Locale, Messages } from "../../runtime/index.ts";
import { bn } from "./bn.ts";
import { en } from "./en.ts";
import { id } from "./id.ts";

export const shellMessages: Readonly<Record<Locale, Messages>> & { readonly id: Messages } = {
  bn,
  en,
  id,
};

export { bn, en, id };
