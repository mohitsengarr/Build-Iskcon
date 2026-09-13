// The image prompt from generateScenePromptInline's JSON.
//
// The inline path (a chapter with no bhagavatam_chapter_scenes row) asks Claude
// for {"imagePrompt": ...}, but the caller read `.prompt`, which is never set.
// So every inline image prompt began with the literal text "undefined" (a
// template string of an undefined scene), and research got no scene text. This
// reads imagePrompt, accepts prompt as a fallback, and otherwise uses a plain
// chapter scene, so the scene is never "undefined".
//
// Pure: no Deno, no IO, so node tests import it directly.

const PLACEHOLDER = /^(undefined|null)$/i;

function usableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && !PLACEHOLDER.test(text) ? text : null;
}

export function inlineImagePrompt(parsed: unknown, chapterTitle?: unknown): string {
  const fields = parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const found = usableText(fields.imagePrompt) ?? usableText(fields.prompt);
  if (found !== null) return found;
  const title = usableText(chapterTitle);
  return title !== null
    ? `A wide establishing shot of the central scene of the Srimad Bhagavatam chapter ${title}, classical Indian devotional oil painting, Raja Ravi Varma aesthetic`
    : "A wide establishing shot of a scene from Srimad Bhagavatam, classical Indian devotional oil painting, Raja Ravi Varma aesthetic";
}
