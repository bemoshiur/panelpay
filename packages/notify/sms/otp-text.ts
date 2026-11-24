// The market setting `numerals` of 16.13: Bengali or Latin digits for counts (the templates and the
// formatters use it; the OTP text below has no count).
export type Numerals = "beng" | "latn";

// WPU-Z3: the gateway (Gennet) requires its own OTP format with the brand in the body, "(BRAND Name) Your
// OTP is: 111111. Please do not share your OTP with anyone.". Ruling: English for every locale, so that
// the operator's template matches. The brand PanelPay is an owner decision (2026-11-13) that overrides
// the 16.13 rule "no AWS mark inside a product, company or domain name" for the SMS brand; the exception
// is this exact token and no other AWS mark (trademark risk recorded for the owner in JOURNEY.md). The
// text is 73 characters, still one GSM 7-bit message, with no URL (an unregistered A2P SMS with a link is
// filtered by operators); the brand is its only word that reads as a domain name (VERIFY in
// docs/runbooks/sms-gateway.md). The code is a technical value in Latin digits, which keeps the
// one-time-code autofill of phones working. The fixed TypeError text never holds the code (R14).
export function otpSmsText(code: string): string {
  if (typeof code !== "string" || !/^[0-9]{6}$/.test(code)) {
    throw new TypeError("otpSmsText: the code is not six digits");
  }
  return `PanelPay Your OTP is: ${code}. Please do not share your OTP with anyone.`;
}
