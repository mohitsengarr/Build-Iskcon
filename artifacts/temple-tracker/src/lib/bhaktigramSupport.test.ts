import { describe, expect, it } from "vitest";
import {
  PRIVACY_PATH,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP,
  SUPPORT_WHATSAPP_DISPLAY,
  supportMailto,
  whatsappUrl,
} from "@/lib/bhaktigramSupport";

describe("whatsappUrl", () => {
  it("links to the support number with digits only", () => {
    expect(whatsappUrl()).toBe("https://wa.me/971504059627");
  });

  it("encodes a prefilled message", () => {
    expect(whatsappUrl("Hare Krishna, I need help with Bhaktigram")).toBe(
      "https://wa.me/971504059627?text=Hare%20Krishna%2C%20I%20need%20help%20with%20Bhaktigram",
    );
  });

  it("treats an empty message as no message", () => {
    expect(whatsappUrl("")).toBe("https://wa.me/971504059627");
  });
});

describe("supportMailto", () => {
  it("opens a plain email to support", () => {
    expect(supportMailto()).toBe("mailto:mohitsengar1992@gmail.com");
  });

  it("encodes the subject", () => {
    expect(supportMailto("Bhaktigram support & feedback")).toBe(
      "mailto:mohitsengar1992@gmail.com?subject=Bhaktigram%20support%20%26%20feedback",
    );
  });
});

describe("support contact", () => {
  it("shows the same number it links to", () => {
    expect(SUPPORT_WHATSAPP_DISPLAY.replace(/\s/g, "")).toBe(SUPPORT_WHATSAPP);
  });

  it("keeps the email and the privacy path stable", () => {
    expect(SUPPORT_EMAIL).toBe("mohitsengar1992@gmail.com");
    expect(PRIVACY_PATH).toBe("/app/privacy");
  });
});
