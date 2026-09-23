// What each Bhagavad-gita chapter's cover shows, and the brief that asks for it.
//
// Why this exists: the whole Gita is spoken in one place, on Arjuna's chariot
// between the two armies. A brief that asks only for "this chapter's central
// moment" therefore gets the same painting eighteen times — Krishna at the reins,
// Arjuna behind him, four white horses, sunset plain — and the canonical
// iconography block, stated unconditionally, made that the safest answer every
// time. Chapters 4, 5, 6, 7 and 8 all came back as that one picture.
//
// So each chapter carries the subject its own verses give it: the banyan tree
// with its roots upward (15.1), the seat of kusa grass (6.11-12), the leaf,
// flower, fruit and water (9.26). The quote is the evidence — every subject here
// is taken from the chapter's own verse in Bhagavad-gita As It Is, not invented —
// and it goes to the brief writer so the moment stays the chapter's own. The
// chariot belongs to four chapters (1, 2, 11, 18) and is kept out of the rest.
//
// Pure: no Deno, no IO, so node tests import it directly.

export interface GitaChapter {
  n: number;
  /** Sanskrit chapter name. */
  sa: string;
  /** English chapter title, as Bhagavad-gita As It Is gives it. */
  en: string;
  /** The subject of this chapter's painting, phrased for a painter. */
  subject: string;
  /** Where the subject comes from, e.g. "Bhagavad-gita 15.1". */
  verse: string;
  /** The translated words the subject rests on, quoted for the brief writer. */
  quote: string;
  /** Whether Arjuna's chariot at Kurukshetra belongs in this chapter's painting. */
  chariot: boolean;
}

export const CHAPTERS: GitaChapter[] = [
  {
    n: 1,
    sa: "अर्जुनविषादयोग",
    en: "Observing the Armies on the Battlefield of Kurukshetra",
    subject: "the chariot drawn up in the open space between the two distant armies, Arjuna looking out at the elders and kinsmen assembled on both sides, his face falling as he recognises them",
    verse: "Bhagavad-gita 1.21-22",
    quote: "please draw my chariot between the two armies so that I may see those present here",
    chariot: true,
  },
  {
    n: 2,
    sa: "सांख्ययोग",
    en: "Contents of the Gita Summarized",
    subject: "Arjuna, his grief spoken, bowing to Krishna as a disciple with folded hands and asking to be taught; Krishna turns from the reins to answer him",
    verse: "Bhagavad-gita 2.7",
    quote: "Now I am Your disciple, and a soul surrendered unto You. Please instruct me.",
    chariot: true,
  },
  {
    n: 3,
    sa: "कर्मयोग",
    en: "Karma-yoga",
    subject: "a Vedic sacrifice at dawn: bearded sages in simple cloth pouring ghee into a square fire altar, the flames rising, villagers standing with grain and folded hands — work done as an offering",
    verse: "Bhagavad-gita 3.9",
    quote: "Work done as a sacrifice for Visnu has to be performed; otherwise work causes bondage in this material world.",
    chariot: false,
  },
  {
    n: 4,
    sa: "ज्ञानकर्मसंन्यासयोग",
    en: "Transcendental Knowledge",
    subject: "the chain by which this knowledge came down, set out across a wide sky: Krishna in soft radiance at one side handing the teaching to Vivasvan the sun-god, brilliant on his solar seat at the centre, and Manu and the king Iksvaku receiving it in turn at the other side",
    verse: "Bhagavad-gita 4.1",
    quote: "I instructed this imperishable science of yoga to the sun-god, Vivasvan, and Vivasvan instructed it to Manu, the father of mankind, and Manu in turn instructed it to Iksvaku.",
    chariot: false,
  },
  {
    n: 5,
    sa: "कर्मसंन्यासयोग",
    en: "Karma-yoga — Action in Krishna Consciousness",
    subject: "a still lotus pond at daybreak, broad lotus leaves beaded with water that will not wet them, and on the bank an ordinary MALE villager of plain human complexion at his daily labour, serene and untouched by what he does",
    verse: "Bhagavad-gita 5.10",
    quote: "One who performs his duty without attachment, surrendering the results unto the Supreme Lord, is unaffected by sinful action, as the lotus leaf is untouched by water.",
    chariot: false,
  },
  {
    n: 6,
    sa: "ध्यानयोग",
    en: "Dhyana-yoga",
    subject: "a lone MALE yogi seated in meditation in a secluded sacred place, on a firm seat of kusa grass covered with a deerskin and a soft cloth, a steady oil lamp beside him unmoved by any wind",
    verse: "Bhagavad-gita 6.11-12",
    quote: "one should go to a secluded place and should lay kusa grass on the ground and then cover it with a deerskin and a soft cloth. The seat should be neither too high nor too low and should be situated in a sacred place.",
    chariot: false,
  },
  {
    n: 7,
    sa: "ज्ञानविज्ञानयोग",
    en: "Knowledge of the Absolute",
    subject: "Krishna present within nature itself: his gentle form in soft radiance above a wide river, the sun and the moon both alight in the sky, clear water cupped in a pilgrim's hands below",
    verse: "Bhagavad-gita 7.8",
    quote: "I am the taste of water, the light of the sun and the moon, the syllable om in the Vedic mantras; I am the sound in ether and ability in man.",
    chariot: false,
  },
  {
    n: 8,
    sa: "अक्षरब्रह्मयोग",
    en: "Attaining the Supreme",
    subject: "an aged MALE devotee at the close of his life, lying peacefully on a simple bed with his hands folded and his eyes raised, Krishna's radiant form waiting above him in the dawn light",
    verse: "Bhagavad-gita 8.5",
    quote: "whoever, at the end of his life, quits his body remembering Me alone at once attains My nature",
    chariot: false,
  },
  {
    n: 9,
    sa: "राजविद्याराजगुह्ययोग",
    en: "The Most Confidential Knowledge",
    subject: "a poor devotee kneeling to offer Krishna a tulasi leaf, a single flower, a piece of fruit and a small pot of water on a leaf plate; Krishna leans forward and accepts it with both hands",
    verse: "Bhagavad-gita 9.26",
    quote: "If one offers Me with love and devotion a leaf, a flower, a fruit or water, I will accept it.",
    chariot: false,
  },
  {
    n: 10,
    sa: "विभूतियोग",
    en: "The Opulence of the Absolute",
    subject: "Krishna standing serene in a vast landscape that shows his opulences at once — the radiant sun low over snow mountains, the moon already risen among the stars, a great river winding below",
    verse: "Bhagavad-gita 10.21",
    quote: "Of the Adityas I am Visnu, of lights I am the radiant sun, of the Maruts I am Marici, and among the stars I am the moon.",
    chariot: false,
  },
  {
    n: 11,
    sa: "विश्वरूपदर्शनयोग",
    en: "The Universal Form",
    subject: "the universal form towering over the plain in a light like many suns rising together, countless faces and arms within it, and small below it Arjuna kneeling with folded hands, awestruck, hair standing on end",
    verse: "Bhagavad-gita 11.12",
    quote: "If hundreds of thousands of suns were to rise at once into the sky, their radiance might resemble the effulgence of the Supreme Person in that universal form.",
    chariot: true,
  },
  {
    n: 12,
    sa: "भक्तियोग",
    en: "Devotional Service",
    subject: "devotees at loving service in a temple courtyard — one stringing a garland, one sweeping, an old woman feeding a dog at the step — all faces calm, equal in happiness and distress, Krishna's small deity form garlanded before them",
    verse: "Bhagavad-gita 12.13-14",
    quote: "One who is not envious but is a kind friend to all living entities, who does not think himself a proprietor and is free from false ego, who is equal in both happiness and distress, who is tolerant... such a devotee of Mine is very dear to Me.",
    chariot: false,
  },
  {
    n: 13,
    sa: "क्षेत्रक्षेत्रज्ञविभागयोग",
    en: "Nature, the Enjoyer, and Consciousness",
    subject: "a ploughed field under a wide sky with a MALE farmer resting at its edge in meditation, and within his heart a small soft light — the body as the field, the soul as the one who knows it",
    verse: "Bhagavad-gita 13.1-2",
    quote: "This body, O son of Kunti, is called the field, and one who knows this body is called the knower of the field.",
    chariot: false,
  },
  {
    n: 14,
    sa: "गुणत्रयविभागयोग",
    en: "The Three Modes of Material Nature",
    subject: "three MALE figures in one composition showing the three modes that bind the soul: a serene sage in white reading by clear morning light, a restless man in red reaching for wealth at midday, and a dull man slumped asleep in shadow",
    verse: "Bhagavad-gita 14.5",
    quote: "Material nature consists of three modes — goodness, passion and ignorance. When the eternal living entity comes in contact with nature, O mighty-armed Arjuna, he becomes conditioned by these modes.",
    chariot: false,
  },
  {
    n: 15,
    sa: "पुरुषोत्तमयोग",
    en: "The Yoga of the Supreme Person",
    subject: "the imperishable banyan tree growing upside down — its roots reaching up into the sky, its branches spreading downward over the earth, its leaves inscribed like Vedic hymns — with a sage gazing up at it",
    verse: "Bhagavad-gita 15.1",
    quote: "It is said that there is an imperishable banyan tree that has its roots upward and its branches down and whose leaves are the Vedic hymns.",
    chariot: false,
  },
  {
    n: 16,
    sa: "दैवासुरसम्पद्विभागयोग",
    en: "The Divine and Demoniac Natures",
    subject: "the divine qualities shown in ordinary acts: a householder giving grain to a hungry traveller at his gate, an ascetic seated in simple austerity nearby, a child sheltering a calf — every face gentle and without anger",
    verse: "Bhagavad-gita 16.1-3",
    quote: "Fearlessness; purification of one's existence; cultivation of spiritual knowledge; charity; self-control; performance of sacrifice; study of the Vedas; austerity; simplicity; nonviolence; truthfulness; freedom from anger...",
    chariot: false,
  },
  {
    n: 17,
    sa: "श्रद्धात्रयविभागयोग",
    en: "The Divisions of Faith",
    subject: "an offering made in the mode of goodness: fresh juicy fruit, ghee, rice and milk arranged on banana leaves before a small home altar, a MALE householder and his wife offering it with quiet faith",
    verse: "Bhagavad-gita 17.8",
    quote: "Foods dear to those in the mode of goodness increase the duration of life, purify one's existence and give strength, health, happiness and satisfaction. Such foods are juicy, fatty, wholesome, and pleasing to the heart.",
    chariot: false,
  },
  {
    n: 18,
    sa: "मोक्षसंन्यासयोग",
    en: "Conclusion — The Perfection of Renunciation",
    subject: "the dialogue ended: Arjuna standing upright at Krishna's side with folded hands and a clear, settled face, his doubt gone, the Gandiva bow taken up again in his other hand, both of them lit by full daylight",
    verse: "Bhagavad-gita 18.73",
    quote: "My dear Krsna, O infallible one, my illusion is now gone. I have regained my memory by Your mercy. I am now firm and free from doubt and am prepared to act according to Your instructions.",
    chariot: true,
  },
];

/** The at-most-6 most recent moments an editor turned down, and the other chapters' moments. */
export interface BriefContext {
  /** Moments rejected for THIS chapter (approve-gita-art, "Reject scene"). */
  rejected?: string[];
  /** Moments already used by OTHER chapters, so eighteen covers stay eighteen pictures. */
  usedElsewhere?: string[];
}

/** How many of each list the brief carries; the rest is noise in a 900-token answer. */
export const MAX_REJECTED = 6;
export const MAX_USED_ELSEWHERE = 17;

export function briefSystemPrompt(): string {
  return [
    "You write artwork briefs for chapters of the Bhagavad-gita As It Is.",
    "Return ONLY valid JSON, no markdown fence:",
    '{"moment":"...","imagePrompt":"...","caption":"...","hashtags":"..."}',
    "moment: the moment the painting shows, in under 12 words (e.g. 'Krishna reveals his universal form to Arjuna').",
    "imagePrompt: ONE English prompt for a devotional oil painting of THIS CHAPTER'S SUBJECT, given below.",
    "  Label every figure MALE or FEMALE. Krishna is a youthful MALE with blue skin and a peacock feather in his crown;",
    "  Arjuna is a muscular MALE warrior. Say who is present, what they do, and the setting. Under 90 words.",
    "THE WHOLE GITA IS SPOKEN IN ONE PLACE, so painting the setting of the dialogue gives eighteen identical covers.",
    "  Paint the chapter's own subject instead: its scene, its figures, its setting, its time of day.",
    "  Do NOT show Arjuna's chariot, the horses, the banner or the two armies unless the subject below asks for them.",
    "WHEN THE SUBJECT DOES SHOW THE CHARIOT, state these explicitly and never contradict them:",
    "  - Arjuna's chariot is drawn by EXACTLY FOUR WHITE HORSES (say 'exactly four white horses'). Never two, never three.",
    "  - Krishna stands at the FRONT of the chariot holding the reins as charioteer; Arjuna stands behind him with the Gandiva bow.",
    "  - The chariot flies a banner bearing HANUMAN.",
    "  - Kurukshetra is a flat open plain; the two armies are distant, never engaged in combat.",
    "WHEREVER KRISHNA APPEARS, in any chapter: blue skin, a peacock feather in his crown, yellow silk (pitambara).",
    "  Krishna ALONE is blue-skinned and wears the peacock feather. A farmer, a yogi, a sage or any other",
    "  figure has ordinary human skin and no peacock feather, even when the chapter is about him.",
    "THE CANVAS IS LANDSCAPE, wider than it is tall. Compose across it — a wide setting, figures placed",
    "  left and right. Never a tall stacked panel: that renders as a narrow strip with empty margins.",
    "PEACEFUL imagery only — teaching, worship, work, reverence, quiet. Never combat, never a corpse, never a wound.",
    "caption: 3-4 lines of plain English on what the chapter teaches. No hashtags inside it.",
    "hashtags: one line of 8-10 relevant tags starting with #BhagavadGita.",
  ].join("\n");
}

function list(heading: string, items: string[], limit: number): string {
  const clean: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const t = typeof item === "string" ? item.trim() : "";
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    clean.push(t);
    if (clean.length >= limit) break;
  }
  if (clean.length === 0) return "";
  return `\n\n${heading}\n` + clean.map((c) => `- ${c}`).join("\n");
}

export function briefUserMessage(ch: GitaChapter, ctx: BriefContext = {}): string {
  const chariot = ch.chariot
    ? "This chapter's subject DOES include Arjuna's chariot: apply the chariot rules above."
    : "This chapter's subject does NOT include the chariot: paint no chariot, no horses, no banner and no armies.";
  return [
    `Chapter ${ch.n}: ${ch.sa} — ${ch.en}`,
    "",
    `SUBJECT TO PAINT: ${ch.subject}`,
    `It rests on ${ch.verse}: "${ch.quote}"`,
    chariot,
    "Keep the subject. Choose the composition, the light and the details yourself.",
  ].join("\n")
    + list(
      "The editor rejected these moments for this chapter. Keep the subject, but depict a clearly DIFFERENT composition, not a variation of any of them:",
      ctx.rejected || [],
      MAX_REJECTED,
    )
    + list(
      "Other chapters' covers already show these moments. This cover must not look like any of them:",
      ctx.usedElsewhere || [],
      MAX_USED_ELSEWHERE,
    );
}
