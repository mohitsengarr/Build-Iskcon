// Which research facts belong to the scene being painted.
//
// Research is cached per chapter (scene_visual_research, key gita:chN), and the
// cache outlives the scene. Chapter 5's row was filled while its cover was the
// chariot at Kurukshetra, so it holds "chariot drawn by four white horses" and
// "Arjuna holding his bow known as Gandiva". Once the chapter's subject became
// the unattached worker at the lotus pond (5.10), those facts were still appended
// to the prompt as Canonical details — and FLUX duly painted a chariot into the
// farmer's field, which the visual check then failed for having three horses.
//
// A fact that names an object the scene does not have is therefore dropped. The
// people filter in index.ts is the same idea for names; this one is for things.
//
// Pure: no Deno, no IO, so node tests import it directly.

/**
 * Groups of words that stand or fall together. A fact matching a group is kept
 * only when the scene matches that same group.
 *
 * Only the chariot is grouped. A fact about Arjuna's bow is left alone: the
 * editor's canon ("Arjuna stands behind Krishna in the chariot holding the
 * Gandiva bow") tells the painter to put the bow in his hands, so it is not a
 * claim about what the scene already names, and the people filter already drops
 * it when Arjuna is not in the painting at all.
 */
export const SCENE_OBJECT_GROUPS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "chariot", re: /\b(chariot|chariots|rein|reins|horse|horses|banner|banners)\b/i },
];

export interface FactSelection {
  kept: string[];
  /** How many facts were dropped for naming something the scene does not show. */
  absent: number;
}

/**
 * Drops facts about objects the scene does not have. A fact naming no object at
 * all (Krishna's blue skin, his peacock feather) is always kept. On any failure
 * nothing is kept, which matches the people filter: a prompt is better without
 * facts than with wrong ones.
 */
export function factsAboutSceneObjects(facts: unknown, sceneText: unknown): FactSelection {
  try {
    if (!Array.isArray(facts)) return { kept: [], absent: 0 };
    const scene = String(sceneText ?? "");
    const kept = facts.filter((f) => {
      const text = typeof f === "string" ? f : "";
      if (!text) return false;
      for (const group of SCENE_OBJECT_GROUPS) {
        if (group.re.test(text) && !group.re.test(scene)) return false;
      }
      return true;
    });
    return { kept, absent: facts.length - kept.length };
  } catch {
    return { kept: [], absent: Array.isArray(facts) ? facts.length : 0 };
  }
}
