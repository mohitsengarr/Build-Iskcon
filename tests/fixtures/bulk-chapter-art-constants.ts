// Verbatim copies of the prompt constants in production bulk-generate-chapter-art
// (master/bulk-generate-chapter-art/index.ts lines 57-89), used to test the
// assemblePrompt budget against the real sizes.
export const GENDER_RULES = [
  "ABSOLUTE GENDER RULES (NEVER VIOLATE):",
  "1) Women MUST have completely smooth clean-shaven feminine faces — ZERO facial hair.",
  "2) Men MUST have clearly masculine faces. Some sages are clean-shaven (Narada, Shukadeva), others bearded (Vyasa, Bhishma) — follow persona description.",
  "3) Men NEVER have flowers in hair — only Krishna may wear a peacock feather.",
  "4) Male and female characters must look visually DISTINCT.",
  "5) BACKGROUND / CROWD figures must be UNAMBIGUOUSLY gendered — males in dhoti, females in sari. If unspecified, render two clearly separate gendered clusters.",
].join(" ");

export const ANACHRONISM_RULES = [
  "ABSOLUTE ANACHRONISM RULES (Vedic/Puranic era — NEVER VIOLATE):",
  "1) NO eyewear of ANY kind — no spectacles, no eyeglasses, no reading glasses, no monocles, no sunglasses, no goggles. Eyes and faces are bare. Sages, scholars and elders read palm-leaf manuscripts with their naked eyes.",
  "2) NO modern clothing — no shirts, no trousers, no buttons, no zippers, no neckties, no western collars, no leather shoes, no sneakers. Only dhotis, saris, uttariyas, angavastrams, shawls, traditional jewelry, sandals or bare feet.",
  "3) NO timepieces or modern technology — NO watch, NO wristwatch, NO smartwatch, NO clock, NO leather wrist strap, NO metal watch band, NO digital display, NO fitness tracker. ALL WRISTS are either BARE or wear only TRADITIONAL bangles (kada, kangan, kankan). A watch on a wrist is FORBIDDEN. Also no pens, no paper books, no printed text, no electrical anything. Only palm-leaf manuscripts, brass vessels, oil lamps, conches.",
  "4) NO modern grooming — NO fade haircuts, NO undercuts, NO buzz cuts, NO pompadours, NO modern barber cuts, NO sharp angular barber-shaped beards, NO hipster goatees, NO designer stubble, NO sculpted beard edges, NO fade lines along the jaw, NO patchy bro-beard. Men are EITHER fully CLEAN-SHAVEN with a smooth jaw (no stubble at all) OR have a FULL NATURAL BEARD that follows the organic jawline — long flowing white/grey for sages and rishis, thick natural black/brown for kings and warriors. Beard edges are SOFT and NATURAL, never razor-sharp. Hair is long and flowing, or tied in a traditional topknot (shikha), or braided — never a modern haircut.",
  "5) NO post-Vedic objects (firearms, mechanical wheels with metal spokes, glass windows, brick architecture). Wooden/stone hermitage, thatched huts, ancient stone temples only.",
].join(" ");

export const ART_STYLE = [
  "museum-quality 19th-century Indian devotional OIL PAINTING on canvas",
  "Raja Ravi Varma 1880-1900 aesthetic, Bombay-school realism",
  "VISIBLE oil-paint brushstrokes and canvas weave texture",
  "matte hand-painted finish, oil glaze layers, impasto highlights",
  "warm saffron / ochre / amber palette",
  "soft golden-hour lighting, mild chiaroscuro",
  "ancient Vedic setting — palm-leaf manuscripts, brass vessels, oil lamps",
  "WIDE landscape composition with rich environment, suitable as a chapter cover",
  "NOT photo-realistic NOT photographic NOT 3D render NOT CGI",
  "NOT cartoon NOT anime NOT manga NOT comic-book NOT cel-shaded",
  "NOT digital illustration NOT vector art NOT airbrushed smooth-render",
  "NOT plastic shiny skin NOT video-game render NOT Pixar style NOT Disney style",
  "NOT modern fantasy concept art NOT Artstation NOT trending Midjourney style",
].join(", ");
