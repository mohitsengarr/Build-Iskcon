// Which Claude model looks at a picture for the image checks: PURE (no Deno
// globals, no network, no remote imports), so it runs under Deno and under Node
// --experimental-strip-types.
//
// Owner, 2026-10-29 (SEN-975): "merge visual and krishna checks on sonnet". Both
// checks ask Sonnet first. Opus is asked only when Sonnet says it is not sure, gives
// an answer that contradicts itself, or gives no usable answer; Opus's answer then
// replaces Sonnet's. Until then every check ran on Opus (SEN-973: the only Opus
// spend in the project).

/** Asked first, for every check. */
export const CHECK_MODEL = "claude-sonnet-5-5";
/** Asked only when the first answer is unsure (see checkModels' callers). */
export const ESCALATION_MODEL = "claude-opus-5-5";
export const CHECK_MODELS = [CHECK_MODEL, ESCALATION_MODEL] as const;
export type CheckModel = typeof CHECK_MODELS[number];

/**
 * The request fields every check shares, for the model asked. Refusals are re-run
 * server-side on a fallback model ("default"). Effort stays medium on both models:
 * counting figures and telling Krishna from other forms needs some thought.
 * Thinking is left at the model's default (on); forced tool use is not allowed with
 * it, so callers send tool_choice auto and name the tool in the text.
 */
export function checkCallFields(model: CheckModel = CHECK_MODEL) {
  return {
    model,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
  };
}

/** The model that answered: the reply's own model field, else the one asked. */
export function answeredBy(message: unknown, asked: string): string {
  // deno-lint-ignore no-explicit-any
  const m = (message as any)?.model;
  return typeof m === "string" && m.length > 0 ? m : asked;
}

/** "in/out" token counts of a reply for the log, or "" when it has none. */
export function usageNote(message: unknown): string {
  // deno-lint-ignore no-explicit-any
  const u = (message as any)?.usage;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const input = n(u?.input_tokens);
  const output = n(u?.output_tokens);
  return input === null || output === null ? "" : `${input}/${output}`;
}
