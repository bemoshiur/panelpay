import { forbiddenWording, messageKeys } from "@tc/ui";
import type { Messages } from "@tc/ui/runtime";
import { describe, expect, it } from "vitest";
import { adminMessages } from "./i18n/messages.ts";
import { bn } from "./messages/bn.ts";
import { en } from "./messages/en.ts";

describe("Admin messages", () => {
  it("bn and en of Admin have the same keys", () => {
    expect(messageKeys(bn)).toEqual(messageKeys(en));
    expect(messageKeys(bn)).toEqual([
      "Admin.home.body",
      "Admin.home.title",
      "Admin.login.code",
      "Admin.login.codeHint",
      "Admin.login.email",
      "Admin.login.errors.denied",
      "Admin.login.errors.invalid",
      "Admin.login.errors.rate_limited",
      "Admin.login.errors.unavailable",
      "Admin.login.intro",
      "Admin.login.password",
      "Admin.login.submit",
      "Admin.login.title",
      "Admin.meta.title",
      "Admin.noAccess.body",
      "Admin.noAccess.login",
      "Admin.noAccess.title",
      "Admin.section.body",
      "Admin.section.title",
      "Admin.signOut",
    ]);
  });

  it("holds the agreed texts", () => {
    expect(bn.Admin.meta.title).toBe("PanelPay অ্যাডমিন");
    expect(en.Admin.meta.title).toBe("PanelPay Admin");
    expect(bn.Admin.home.title).toBe("অ্যাডমিন প্যানেল তৈরি হচ্ছে");
    expect(en.Admin.home.title).toBe("The admin panel is being built");
    expect(bn.Admin.home.body).toBe("এই পৃষ্ঠায় এখন শুধু কাঠামো আছে।");
    expect(en.Admin.home.body).toBe("This page holds the frame only for now.");
  });

  it("holds no forbidden wording", () => {
    expect(forbiddenWording(bn)).toEqual([]);
    expect(forbiddenWording(en)).toEqual([]);
  });

  it("adminMessages has the kit, Shell, Aws and Admin namespaces for bn and en, without a collision", () => {
    for (const locale of ["bn", "en"] as const) {
      const messages: Messages = adminMessages[locale];
      expect(messages["kit"], locale).toBeDefined();
      expect(messages["Shell"], locale).toBeDefined();
      expect(messages["Aws"], locale).toBeDefined();
      expect(messages["Admin"], locale).toBeDefined();
    }
  });

  it("does not carry the Web namespace", () => {
    expect(adminMessages.bn["Web"]).toBeUndefined();
    expect(adminMessages.en["Web"]).toBeUndefined();
  });
});
