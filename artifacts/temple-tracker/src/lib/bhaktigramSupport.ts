// How devotees reach the Bhaktigram team (Mohit, 23 Oct 2026). One place, so
// the /app support section, the privacy policy and the App Store support URL
// always show the same contact.

export const SUPPORT_EMAIL = "mohitsengar1992@gmail.com";

/** WhatsApp number in E.164 form. */
export const SUPPORT_WHATSAPP = "+971504059627";

/** The number as people write it: +971 50 405 9627. */
export const SUPPORT_WHATSAPP_DISPLAY = "+971 50 405 9627";

export const PRIVACY_PATH = "/app/privacy";

/** wa.me link for the support number, optionally with a prefilled message. */
export function whatsappUrl(text?: string): string {
  const digits = SUPPORT_WHATSAPP.replace(/\D/g, "");
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** mailto link for support, optionally with a subject. */
export function supportMailto(subject?: string): string {
  return subject
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${SUPPORT_EMAIL}`;
}
