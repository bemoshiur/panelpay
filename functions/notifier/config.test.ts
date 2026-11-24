import { expect, it } from "vitest";
import { NOTIFIER_CONFIG_ERROR, readNotifierConfig } from "./config";

const env = (over: Record<string, string | undefined> = {}) => ({
  PANEL_ORIGIN: "https://my.ticoncloud.test",
  // WPU-Z8: the display name of the brand has a dot (PanelPay); the sender check must take it.
  SES_FROM: "PanelPay <no-reply@ticoncloud.test>",
  ...over,
});

it("reads the panel origin and the sender", () => {
  expect(readNotifierConfig(env())).toEqual({
    panelOrigin: "https://my.ticoncloud.test",
    sesFrom: "PanelPay <no-reply@ticoncloud.test>",
  });
  expect(readNotifierConfig(env({ SES_FROM: "no-reply@ticoncloud.test" })).sesFrom).toBe(
    "no-reply@ticoncloud.test",
  );
});

it("fails closed with one fixed message, no value", () => {
  const bad: Record<string, string | undefined>[] = [
    { PANEL_ORIGIN: undefined },
    { PANEL_ORIGIN: "" },
    { PANEL_ORIGIN: "http://my.ticoncloud.test" },
    { PANEL_ORIGIN: "https://my.ticoncloud.test/path" },
    { PANEL_ORIGIN: "https://user:pw@my.ticoncloud.test" },
    { SES_FROM: undefined },
    { SES_FROM: "" },
    { SES_FROM: "no-at-sign" },
    { SES_FROM: "a@b.test\r\nBcc: x@y.test" },
    { SES_FROM: "<script>@x.test" },
  ];
  for (const over of bad) {
    let message = "";
    try {
      readNotifierConfig(env(over));
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message, JSON.stringify(over)).toBe(NOTIFIER_CONFIG_ERROR);
  }
});
