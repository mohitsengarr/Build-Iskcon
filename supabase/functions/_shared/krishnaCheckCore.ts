// Krishna check: PURE logic (no Deno globals, no network, no remote imports), so
// it runs unchanged under Deno and under Node --experimental-strip-types.
//
// Owner, 2026-10-23: "do not post any photos on Threads or Instagram with no
// Krishna in it". Before a picture goes to Buffer, Claude looks at it and records
// whether Lord Krishna Himself is shown, in which form and how prominently. The
// record names the exact image it judged (image_path), so a replaced or stamped
// image is checked again. Only a current record that says Krishna is clearly shown
// in His own form lets a post go out; no record, an old record, an unclear answer
// or a failed check keeps it back.

import { type ImageMediaType, VISUAL_CHECK_MODEL } from "./visualCheckCore.ts";

export const KRISHNA_CHECK_VERSION = 1;
export const KRISHNA_TOOL_NAME = "record_krishna_check";
export const KRISHNA_CHECK_MODEL = VISUAL_CHECK_MODEL;
/** Larger base64 images are not sent (the check fails closed). */
export const MAX_KRISHNA_IMAGE_B64_CHARS = 5_000_000;
export const MAX_OBSERVED_CHARS = 240;

/** What the painting shows. The first four are Krishna in His own form. */
export const KRISHNA_FORMS = [
  "krishna",
  "child_krishna",
  "radha_krishna",
  "krishna_deity",
  "jagannath",
  "chaitanya",
  "vishnu_or_narayana",
  "rama",
  "other_deity_or_avatar",
  "none",
] as const;
export type KrishnaForm = typeof KRISHNA_FORMS[number];
export const POSTABLE_FORMS: readonly KrishnaForm[] = ["krishna", "child_krishna", "radha_krishna", "krishna_deity"];

export const PROMINENCES = ["main", "secondary", "background", "none"] as const;
export type Prominence = typeof PROMINENCES[number];
export const POSTABLE_PROMINENCES: readonly Prominence[] = ["main", "secondary"];

export interface KrishnaAnswer {
  krishna_visible: boolean;
  form: KrishnaForm;
  prominence: Prominence;
  observed: string;
}

/** Stored on the row (krishna_check) for the image it judged. */
export interface KrishnaCheck extends KrishnaAnswer {
  version: number;
  image_path: string;
  model: string;
  checked_at: string;
}

export const KRISHNA_TOOL = {
  name: KRISHNA_TOOL_NAME,
  description: "Record whether Lord Krishna Himself is shown in the painting, in which form and how prominently.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["krishna_visible", "form", "prominence", "observed"],
    properties: {
      krishna_visible: { type: "boolean", description: "True only if Krishna Himself is clearly shown." },
      form: { type: "string", enum: [...KRISHNA_FORMS] },
      prominence: { type: "string", enum: [...PROMINENCES] },
      observed: { type: "string", description: "One short sentence on who the painting shows." },
    },
  },
};

export function buildKrishnaText(): string {
  return [
    "Look at this painting and say whether Lord Sri Krishna Himself is shown in it.",
    "",
    "Krishna counts when He is clearly shown as a figure: for example the dark-blue cowherd boy with a peacock feather and a flute, baby or child Krishna (Gopala, Damodara), Krishna with Radha or the gopis, Krishna as Arjuna's charioteer, Krishna as a king in Dvaraka, or a deity (murti) of Krishna or of Radha-Krishna on an altar.",
    "",
    "Not Krishna for this check: Vishnu or Narayana with four arms, Rama, Narasimha or other avatars, Lord Jagannath, Sri Chaitanya Mahaprabhu, Balarama, Shiva, Brahma, demigods, sages, devotees, or a symbol on its own (a flute or a peacock feather with no Krishna).",
    "",
    "Fields:",
    "- krishna_visible: true only if Krishna Himself is clearly shown as described above. If you are not sure, false.",
    "- form: if Krishna is shown, the form He is shown in (krishna, child_krishna, radha_krishna, krishna_deity). Otherwise the main sacred figure shown (jagannath, chaitanya, vishnu_or_narayana, rama, other_deity_or_avatar), or none.",
    "- prominence: how prominent Krishna is: main (a central figure), secondary (clearly visible, not central), background (small or hard to make out), none (not shown).",
    "- observed: one short sentence on who the painting shows.",
    "",
    `Call the ${KRISHNA_TOOL_NAME} tool once.`,
  ].join("\n");
}

/** Params for client.beta.messages.create: the image, then the question. */
export function buildKrishnaParams(input: { imageB64: string; mediaType: ImageMediaType }) {
  return {
    model: KRISHNA_CHECK_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    tools: [KRISHNA_TOOL],
    // Not forced: thinking is on by default and forced tool use conflicts with it.
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.imageB64 } },
          { type: "text", text: buildKrishnaText() },
        ],
      },
    ],
  };
}

/** Reads the tool answer; anything malformed is not an answer. */
export function parseKrishnaCheck(message: unknown):
  | { outcome: "ok"; answer: KrishnaAnswer }
  | { outcome: "refusal" | "no_tool" | "invalid" } {
  // deno-lint-ignore no-explicit-any
  const m = message as any;
  if (!m || typeof m !== "object") return { outcome: "no_tool" };
  if (m.stop_reason === "refusal") return { outcome: "refusal" };
  const content = Array.isArray(m.content) ? m.content : [];
  // deno-lint-ignore no-explicit-any
  const input = content.find((b: any) => b && b.type === "tool_use" && b.name === KRISHNA_TOOL_NAME)?.input;
  if (!input || typeof input !== "object") return { outcome: "no_tool" };
  const { krishna_visible, form, prominence, observed } = input;
  if (typeof krishna_visible !== "boolean") return { outcome: "invalid" };
  if (!(KRISHNA_FORMS as readonly string[]).includes(form)) return { outcome: "invalid" };
  if (!(PROMINENCES as readonly string[]).includes(prominence)) return { outcome: "invalid" };
  const note = typeof observed === "string" ? observed.replace(/\s+/g, " ").trim().slice(0, MAX_OBSERVED_CHARS) : "";
  return { outcome: "ok", answer: { krishna_visible, form, prominence, observed: note } };
}

export function krishnaRecord(answer: KrishnaAnswer, imagePath: string, model: string, at: Date): KrishnaCheck {
  return { version: KRISHNA_CHECK_VERSION, image_path: imagePath, model, checked_at: at.toISOString(), ...answer };
}

/** A record made by this version of the check for exactly this image. */
export function isCurrentCheck(check: unknown, imagePath: unknown): check is KrishnaCheck {
  // deno-lint-ignore no-explicit-any
  const c = check as any;
  return !!c && typeof c === "object" && c.version === KRISHNA_CHECK_VERSION &&
    typeof imagePath === "string" && imagePath.length > 0 && c.image_path === imagePath;
}

/** Whether a picture may go to Instagram or Threads, and why not. */
export function krishnaAllowed(check: unknown, imagePath: unknown): { allowed: boolean; reason: string } {
  if (!isCurrentCheck(check, imagePath)) return { allowed: false, reason: "this picture has not been checked for Krishna" };
  if (!check.krishna_visible || check.form === "none") {
    return { allowed: false, reason: `no Krishna in the picture${check.observed ? ` (${check.observed})` : ""}` };
  }
  if (!POSTABLE_FORMS.includes(check.form)) {
    return { allowed: false, reason: `Krishna is not shown in His own form (${check.form})` };
  }
  if (!POSTABLE_PROMINENCES.includes(check.prominence)) {
    return { allowed: false, reason: "Krishna is only in the background" };
  }
  return { allowed: true, reason: "Krishna is in the picture" };
}

/** Base64 of image bytes, in chunks so a large image does not overflow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}
