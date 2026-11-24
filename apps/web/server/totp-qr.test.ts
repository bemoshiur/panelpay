import { describe, expect, it } from "vitest";
import { QR_MARGIN, qrPathOf } from "./totp-qr.ts";

// WPU-X11: the QR code of the otpauth URI, as path data for one inline SVG path.

const URI =
  "otpauth://totp/PanelPay?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=PanelPay&algorithm=SHA1&digits=6&period=30";

function darkSet(d: string): Set<string> {
  return new Set([...d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map((m) => `${m[1]},${m[2]}`));
}

describe("qrPathOf", () => {
  it("makes a valid QR size (21 + 4k modules) with the quiet zone of 4", () => {
    const qr = qrPathOf(URI);
    expect((qr.size - 21) % 4).toBe(0);
    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect(qr.margin).toBe(QR_MARGIN);
  });

  it("draws the three finder patterns (the 7x7 dark rings) in the corners", () => {
    const qr = qrPathOf(URI);
    const dark = darkSet(qr.d);
    const m = QR_MARGIN;
    for (const [x0, y0] of [
      [m, m],
      [m + qr.size - 7, m],
      [m, m + qr.size - 7],
    ] as const) {
      for (let i = 0; i < 7; i++) {
        // The outer ring of each finder is dark.
        expect(dark.has(`${x0 + i},${y0}`)).toBe(true);
        expect(dark.has(`${x0 + i},${y0 + 6}`)).toBe(true);
        expect(dark.has(`${x0},${y0 + i}`)).toBe(true);
        expect(dark.has(`${x0 + 6},${y0 + i}`)).toBe(true);
      }
      // The ring inside it is light, the 3x3 centre is dark.
      expect(dark.has(`${x0 + 1},${y0 + 1}`)).toBe(false);
      expect(dark.has(`${x0 + 3},${y0 + 3}`)).toBe(true);
    }
  });

  it("is the same for the same text and different for another secret", () => {
    expect(qrPathOf(URI).d).toBe(qrPathOf(URI).d);
    expect(qrPathOf(URI.replace("JBSWY3DP", "KRSXG5CT")).d).not.toBe(qrPathOf(URI).d);
  });

  it("holds only path commands: no markup, no attribute, no text of the URI", () => {
    const { d } = qrPathOf(URI);
    expect(d).toMatch(/^(M\d+ \d+h1v1h-1z)+$/);
    expect(d).not.toContain("JBSWY3DP");
  });
});
