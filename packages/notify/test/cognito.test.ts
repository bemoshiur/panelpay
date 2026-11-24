import { expect, it } from "vitest";
import { COGNITO_MESSAGE_KINDS, renderCognitoMessage } from "../templates/cognito";
import * as entry from "../index";

const CODE = "{####}";
const USER = "{username}";
const render = (kind: (typeof COGNITO_MESSAGE_KINDS)[number], locale: "bn" | "en") =>
  renderCognitoMessage(kind, locale, { code: CODE, username: USER });

it("is exported by the package entry", () => {
  expect(entry.renderCognitoMessage).toBe(renderCognitoMessage);
  expect(entry.COGNITO_MESSAGE_KINDS).toEqual(COGNITO_MESSAGE_KINDS);
});

it("renders the three messages of 16.14 in bn and en, each with the code placeholder", () => {
  expect([...COGNITO_MESSAGE_KINDS]).toEqual(["verify_code", "reset_code", "admin_temp_password"]);
  for (const kind of COGNITO_MESSAGE_KINDS) {
    for (const locale of ["bn", "en"] as const) {
      const m = render(kind, locale);
      expect(m.subject.length, `${kind} ${locale}`).toBeGreaterThan(0);
      expect(m.subject).not.toMatch(/[\r\n]/);
      expect(m.html).toContain(`<html lang="${locale}">`);
      expect(m.html).toContain(CODE);
      expect(m.html).toContain("PanelPay");
      expect(m.html).not.toMatch(/AWS Lightsail/);
      // the layout of the other emails: header, footer with the AWS statement
      expect(m.html).toContain("Amazon Web Services, AWS, Amazon Lightsail");
    }
  }
});

it("writes Bengali for bn and English for en", () => {
  expect(render("verify_code", "bn").html).toMatch(/[ঀ-৿]/);
  expect(render("verify_code", "en").html).toContain("verification code");
  expect(render("reset_code", "en").html).toContain("reset");
});

it("puts the username placeholder only in the admin message", () => {
  expect(render("admin_temp_password", "en").html).toContain(USER);
  expect(render("verify_code", "en").html).not.toContain(USER);
  expect(render("reset_code", "bn").html).not.toContain(USER);
});

it("accepts only Cognito's own placeholders, so no input reaches the HTML", () => {
  const bad = [
    "",
    "123456",
    "<script>alert(1)</script>",
    "{####}<b>",
    "{#}",
    "{ #### }",
    "{####}{####}",
  ];
  for (const code of bad) {
    expect(() => renderCognitoMessage("verify_code", "en", { code }), code).toThrow(
      "cognito message: bad placeholder",
    );
  }
  for (const username of ["", "<img src=x>", "{user}", "bob", "{username}x"]) {
    expect(
      () => renderCognitoMessage("admin_temp_password", "en", { code: CODE, username }),
      username,
    ).toThrow("cognito message: bad placeholder");
  }
  expect(() => renderCognitoMessage("admin_temp_password", "en", { code: CODE })).toThrow(
    "cognito message: bad placeholder",
  );
});

it("refuses an unknown kind or locale", () => {
  expect(() => renderCognitoMessage("other" as never, "en", { code: CODE })).toThrow(
    "cognito message: unknown message",
  );
  expect(() => renderCognitoMessage("verify_code", "fr" as never, { code: CODE })).toThrow(
    "cognito message: unknown message",
  );
});

it("holds no script, no remote image, no link", () => {
  for (const kind of COGNITO_MESSAGE_KINDS) {
    for (const locale of ["bn", "en"] as const) {
      const { html } = render(kind, locale);
      expect(html).not.toMatch(/<script|<img|<iframe|href=/i);
    }
  }
});
