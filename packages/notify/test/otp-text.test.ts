import { expect, it } from "vitest";
import { otpSmsText } from "../sms/otp-text";

// WPU-Z3: the gateway (Gennet) requires its own OTP format with the brand in the body, in English for
// every locale, so that the operator's template matches. The brand is PanelPay (owner decision of
// 2026-11-13): the one exception to the 16.13 rule "no AWS mark inside a product, company or domain
// name", for this exact token only.
const BRAND = "PanelPay";

it("is exactly the provider's OTP format with the brand PanelPay, the same for every customer", () => {
  expect(otpSmsText("000042")).toBe(
    "PanelPay Your OTP is: 000042. Please do not share your OTP with anyone.",
  );
  expect(otpSmsText("123456")).toBe(
    "PanelPay Your OTP is: 123456. Please do not share your OTP with anyone.",
  );
});

it("fits one GSM 7-bit SMS: 71 characters, plain ASCII letters, digits and marks", () => {
  const text = otpSmsText("123456");
  expect(text).toHaveLength(71);
  expect(text.length).toBeLessThanOrEqual(160);
  expect(text).toMatch(/^[A-Za-z0-9 .,:]+$/);
});

it("holds the code once and the brand once at the start, no link and no other AWS name", () => {
  const text = otpSmsText("123456");
  expect(text.split("123456")).toHaveLength(2);
  expect(text.startsWith(`${BRAND} `)).toBe(true);
  expect(text.split(BRAND)).toHaveLength(2);
  const rest = text.replace(BRAND, "");
  // no URL, and the brand is the only word that reads as a domain name
  expect(text).not.toMatch(/https?:|www\./i);
  expect(rest).not.toMatch(/[a-z0-9-]+\.[a-z]{2,}/i);
  // the exception is the exact token PanelPay (16.13 ruling): no other AWS mark anywhere in the text
  expect(rest).not.toMatch(/AWS|Amazon|Lightsail/i);
});

it("refuses a code that is not six digits, with a fixed message that holds no code", () => {
  for (const code of ["12345", "12345a", "", "1234567", " 123456", "123456\n", "١٢٣٤٥٦"]) {
    expect(() => otpSmsText(code), JSON.stringify(code)).toThrow(
      new TypeError("otpSmsText: the code is not six digits"),
    );
  }
  for (const code of [123456, null, undefined]) {
    expect(() => otpSmsText(code as never), String(code)).toThrow(TypeError);
  }
});
