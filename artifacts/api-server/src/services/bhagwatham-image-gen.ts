import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { logger } from "../lib/logger";
import Anthropic from "@anthropic-ai/sdk";
import { reportAIFailure } from "./ai-credit-monitor";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "..", "data", "bhagwatham");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const MANIFEST_FILE = path.join(IMAGES_DIR, "manifest.json");
const TRASH_DIR = path.join(IMAGES_DIR, ".trash");
const TRASH_META_FILE = path.join(TRASH_DIR, "trash-meta.json");

// ── Trash / Undo support ────────────────────────────────────────────────────

interface TrashEntry {
  trashId: string;
  originalFile: string;        // filename in images dir
  trashedFile: string;         // filename in trash dir
  manifestEntry: ChapterImage; // full manifest metadata for restore
  trashedAt: string;
  operation: "delete" | "regenerate";
}

function ensureTrashDir() {
  if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });
}

function readTrashMeta(): TrashEntry[] {
  if (!fs.existsSync(TRASH_META_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(TRASH_META_FILE, "utf-8")); }
  catch { return []; }
}

function writeTrashMeta(entries: TrashEntry[]) {
  ensureTrashDir();
  fs.writeFileSync(TRASH_META_FILE, JSON.stringify(entries, null, 2) + "\n");
}

/** Move an image file to trash and record metadata for undo */
function trashImage(img: ChapterImage, operation: "delete" | "regenerate"): string {
  ensureTrashDir();
  const trashId = `${img.chapterNumber}-${img.sceneIndex ?? 0}-${Date.now()}`;
  const srcPath = path.join(IMAGES_DIR, img.imagePath);
  const ext = path.extname(img.imagePath);
  const trashedFile = `${trashId}${ext}`;
  const destPath = path.join(TRASH_DIR, trashedFile);

  if (fs.existsSync(srcPath)) {
    fs.renameSync(srcPath, destPath);
  }

  const entries = readTrashMeta();
  entries.push({
    trashId,
    originalFile: img.imagePath,
    trashedFile,
    manifestEntry: { ...img },
    trashedAt: new Date().toISOString(),
    operation,
  });
  // Keep only last 50 trash entries to avoid unbounded growth
  while (entries.length > 50) {
    const old = entries.shift()!;
    const oldPath = path.join(TRASH_DIR, old.trashedFile);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  writeTrashMeta(entries);
  logger.info({ trashId, file: img.imagePath, operation }, "Image moved to trash");
  return trashId;
}

/** Restore an image from trash back to images dir and manifest */
export function restoreImage(trashId: string): { success: boolean; restored?: ChapterImage } {
  const entries = readTrashMeta();
  const idx = entries.findIndex(e => e.trashId === trashId);
  if (idx === -1) return { success: false };

  const entry = entries[idx];
  const trashedPath = path.join(TRASH_DIR, entry.trashedFile);
  const restorePath = path.join(IMAGES_DIR, entry.originalFile);

  // Move file back
  if (fs.existsSync(trashedPath)) {
    // If a new image was generated at the same path, remove it first
    if (fs.existsSync(restorePath)) fs.unlinkSync(restorePath);
    fs.renameSync(trashedPath, restorePath);
  } else {
    return { success: false };
  }

  // Restore manifest entry — remove any current entry for same chapter+scene, then add back the old one
  const manifest = readManifest();
  const chNum = entry.manifestEntry.chapterNumber;
  const scIdx = entry.manifestEntry.sceneIndex ?? 0;
  manifest.images = manifest.images.filter(
    i => !(i.chapterNumber === chNum && (i.sceneIndex ?? 0) === scIdx)
  );
  manifest.images.push(entry.manifestEntry);
  manifest.lastUpdated = new Date().toISOString();
  writeManifest(manifest);

  // Remove from trash meta
  entries.splice(idx, 1);
  writeTrashMeta(entries);

  logger.info({ trashId, file: entry.originalFile }, "Image restored from trash");
  return { success: true, restored: entry.manifestEntry };
}

// NOTE: Art style is now inline in generateWithTogether() to keep it next to the prompt composition logic.
// The inline styleSuffix includes strict gender differentiation rules.

// ── Character Personas — consistent appearance across all images ─────────────
// Each character has a fixed description so they look the same everywhere.
const CHARACTER_PERSONAS: Record<string, string> = {
  krishna_adult: "Lord Krishna: a handsome MALE young man aged 20-25 with luminous deep blue skin like a dark rain cloud (hex #1a3a6b), oval face shape, high cheekbones, large lotus-like almond-shaped dark brown eyes set wide apart with thick dark eyelashes and attractively moving eyebrows, straight narrow nose, full lips with enchanting gentle serene smile, clean-shaven smooth masculine face with strong jawline, curly jet-black shoulder-length hair adorned with a single iridescent peacock feather and blue karnikara flowers tucked into a golden mukut crown, wearing brilliant yellow silk pitambara dhoti as golden as the sun, Kaustubha gem pendant glowing on broad bare masculine chest, Vaijayanti garland of five-colored ever-fresh forest flowers reaching to his knees, golden armlets and bracelets, bamboo flute (murali) in hand, reddish-soled feet with auspicious marks, broad masculine shoulders and muscular arms",
  krishna_child: "Baby Krishna: an adorable divine infant aged 1-2 with soft round chubby blue-tinted cheeks (hex #4a7ab5), perfectly round face, large sparkling doe-like dark brown eyes taking up one-third of face with thick baby lashes, tiny upturned button nose, small full lips with playful mischievous open smile showing no teeth, curly black wispy hair with a small peacock feather, wearing miniature golden crown, tiny gold anklets and waistband, pearl necklace",
  narada: "Sage Narada: a MALE sage aged 45-50 with rectangular face shape, strong square masculine jawline, fair wheat-toned skin (hex #c4956a), completely clean-shaven smooth face, happy chanting countenance with warm radiant open-mouth smile always chanting Narayana-Narayana, bright alert hazel-brown eyes, prominent vertical white U-shaped Vaishnava tilak mark on forehead with Vaishnava symbols on body, grey-streaked dark hair tied neatly in a high topknot bun, slender athletic MALE build with bare masculine chest, wearing simple white cotton dhoti with golden border, sacred thread (yajnopavita) crossing diagonally over chest, bead garland around neck, carrying his signature tanpura veena (mahathi) instrument in left hand and khartal (hand cymbals), celestial cosmic messenger of the gods",
  vyasa: "Sage Vyasa (Krishna Dvaipayana Vedavyasa): a majestic elderly rishi aged 70-80 with broad square face, very dark brown complexion like night (hex #4a3220) — named Krishna Dvaipayana for his dark skin, long flowing silver-white beard with yellowish-brown tinge reaching mid-chest, deep-set wise penetrating bright dark brown eyes under heavy hooded eyelids with bushy white eyebrows, very broad high forehead with three horizontal ash-white tilak lines, thick brown-grey matted hair in tall jata dreadlocks piled upward, large aquiline nose with prominent bridge, thin firm lips, strong dignified upright bearing with broad shoulders, wearing rough bark-cloth garment draped over left shoulder and deerskin on right, large rudraksha mala with 108 beads around neck, palm-leaf manuscripts and reed stylus nearby",
  suta_goswami: "Suta Goswami: an elderly sage aged 65-70 with round soft face, fair pinkish-white complexion (hex #e8c9a0), neatly trimmed short white beard close to face, calm serene medium almond-shaped light brown eyes with gentle crow's feet wrinkles, thin white eyebrows, gentle knowing closed-mouth smile with slightly upturned corners, prominent vertical white tilak on forehead, bald shiny crown with neat white hair remaining on sides and back, small rounded nose, wearing saffron silk robes with gold border draped over both shoulders, rudraksha mala around neck",
  shukadeva: "Shukadeva Goswami: a very young sage aged 16-17 with oval delicate face, radiant golden-fair luminous complexion (hex #f0d4a0), completely clean-shaven bald head with smooth scalp, very large luminous innocent wide-open dark brown eyes with long lashes giving childlike appearance, thin light eyebrows, small straight nose, slight knowing half-smile with closed lips, slender youthful build with narrow shoulders, wearing only a simple undyed white cotton cloth loosely wrapped around waist, no ornaments at all, barefoot, emanating a natural divine glow around head",
  arjuna: "Arjuna (Kiriti — the diadem-wearer): a tall muscular MALE warrior prince aged 30-35 with chiseled diamond-shaped face, fair wheatish radiant complexion (hex #d4a574), sharp handsome angular features, determined focused intense dark brown eyes with thick straight eyebrows, strong prominent square masculine jaw, high straight nose with defined bridge, thin firm lips, neatly tied long dark black hair in a tight warrior topknot secured with celestial golden diadem (kiriti-mukut) bestowed by Indra across forehead, clean-shaven face, tall athletic muscular build with sinewy broad shoulders and strong bow-bending arms, wearing gleaming golden chest armor with engraved patterns and silver arm-guards, twin inexhaustible quivers on back, carrying the mighty celestial Gandiva bow, golden chariot with Hanuman (vanara) banner emblem nearby",
  vishnu: "Lord Vishnu: a supreme divine being aged 25-30 with perfectly symmetrical oval face, deep royal blue skin (hex #1a2d6b), serene majestic face with perfectly proportioned large symmetrical almond eyes with golden irises, high arched eyebrows, straight perfect nose, gentle compassionate closed-mouth smile with full lips, wearing magnificent tall golden crown studded with rubies and emeralds, yellow silk garments, four arms holding conch Panchajanya in upper right, discus Sudarshana in upper left, mace Kaumodaki in lower left, and lotus in lower right",
  brahma: "Lord Brahma: the creator god with four faces visible in three-quarter view, aged appearance around 60, reddish-golden warm complexion (hex #c49040), long white flowing beard on each face reaching chest, wise contemplative half-closed medium eyes with golden-brown irises, bushy white eyebrows, broad nose, wearing elaborate red-golden silk robes, tall golden crown on each head, four arms holding Vedas book, a brass water pot (kamandalu), crystal prayer beads, and white lotus",
  prahlada: "Prahlada: a young boy aged 6-7 with soft round childish face, warm brown skin (hex #8b6940), innocent round face with chubby cheeks, very large devotional wide-open dark brown eyes with long lashes full of faith and wonder, small rounded nose, slight gentle closed-mouth smile, short black hair neatly combed, small build, wearing simple white prince kurta with minimal thin gold necklace and small armlets, a small tulsi mala around his neck",
  narasimha: "Lord Narasimha: a fierce half-lion half-man divine avatar — lion head and forearms with clawed paws fused with muscular MALE blue-skinned (hex #2a4a7b) human torso and lower body, massive golden-brown flowing lion mane framing the fierce face, fearsome lion visage with wide-open blazing golden-yellow fiery eyes with slit pupils, broad flat lion nose, open roaring mouth showing sharp white fangs and bared teeth, terrifying ugra-raudra expression yet protective toward devotees, wearing golden ornaments on powerful arms and yellow silk garment around waist, divine golden effulgence radiating outward",
  parikshit: "King Parikshit: a dignified middle-aged king aged 50-55 with rectangular noble face, fair complexion (hex #d4b896), well-groomed short dark brown beard trimmed close to jawline, serious contemplative deep-set dark brown eyes with slight dark circles showing renunciation, high forehead with vertical sandalwood tilak, greying dark hair tied back, medium build, wearing simple unadorned white cotton cloth having renounced his kingdom, sitting cross-legged",
  yashoda: "Mother Yashoda: a beautiful middle-aged woman aged 35-40 with round full face, warm fair pinkish complexion (hex #e0b88a), loving maternal soft features, large expressive almond-shaped dark brown eyes with kajal liner, rounded nose with small gold nose stud on left, gentle affectionate warm smile showing slight dimples, dark black hair parted in center with red sindoor in parting and tied in a low bun, wearing a rich maroon silk sari with gold zari border, gold nose ring, matching gold bangles on both wrists, and gold jhumka earrings",
  kunti: "Queen Kunti: a dignified elderly Indian woman aged 60-65 with oval thin face showing graceful aging, fair complexion (hex #d4b896), gentle sorrowful slightly downcast dark brown eyes with fine wrinkles, thin greying dark hair in a tight bun at nape covered with a white silk pallu, straight thin nose, thin lips with dignified composed expression, graceful noble upright bearing despite age, wearing a white and gold silk sari draped modestly, small gold earrings and thin gold bangles, vermillion circular tilak on forehead",
  draupadi: "Draupadi (Krishnaa — the dark-skinned one): a strikingly beautiful young FEMALE woman aged 25-28 (NO beard NO facial hair) with heart-shaped face, dark olive-brown complexion like night (hex #7a5a3a) — called Krishnaa for her dark beauty, large fierce expressive lotus-petal almond-shaped dark eyes with thick kajal and bold arched eyebrows, proud noble bearing with chin slightly raised, long thick dark black wavy-curly hair reaching waist adorned with jasmine flowers and blue curly locks, straight nose with gold nose pin, full lips, natural intoxicating fragrance (Yojanagandhi), nails beautifully convex and bright, wearing a rich red and gold silk sari with heavy gold zari, gold choker necklace with ruby, large gold jhumka earrings, stacked gold bangles, vermillion sindoor in hair parting",
  gandhari: "Queen Gandhari: a dignified elderly Indian woman aged 65-70 with thin oval face, fair pale complexion (hex #e0c8a8), a wide white silk blindfold covering her eyes completely as a lifelong vow tied at back of head, serene composed straight-lipped expression, greying white hair fully covered with a white silk pallu draped over head, wearing a simple white silk sari with thin gold border, thin gold bangles on wrists",
  dhritarashtra: "King Dhritarashtra: a very old blind Indian king aged 80+ with long narrow gaunt face, pale sallow complexion (hex #c8a878), permanently closed sunken sightless eyes with deep dark hollows, long thin white beard reaching mid-chest, deeply wrinkled face showing years of inner conflict and grief, tall but stooped hunched bearing, bony hands, wearing simple white royal cotton garments, gripping a wooden walking staff in right hand",
  vidura: "Vidura: a wise middle-aged Indian man aged 55-60 with angular lean face, dark brown complexion (hex #5a3a20), calm penetrating sharp medium-sized dark brown eyes with intense focused gaze, neatly trimmed short grey beard close to face, prominent high cheekbones, straight nose, thin firm lips, dignified humble slightly bowed bearing, wearing simple saffron dhoti and white uttariya cloth over left shoulder, carrying a wooden pilgrim's walking staff",
  bhishma: "Bhishma Pitamah (Gauranga — the fair-bodied, Shvetaveera — the white warrior): a majestic elderly MALE warrior aged 75-80 with broad strong square face, fair luminous complexion (hex #d0b890), silver-white hair flowing loose and long flowing thick white beard reaching chest, powerful broad-shouldered muscular build despite advanced age — invincible warrior son of sacred Ganga and greatest warrior of his time, wise serene half-open dark brown eyes with heavy eyelids showing acceptance, thick white eyebrows, large straight nose, wearing white warrior garments with silver armor elements, lying on a raised bed of arrows with multiple arrows piercing his entire body supporting him above the ground",
  yudhishthira: "King Yudhishthira: a fair-complexioned noble Indian king aged 35-40 with oval gentle face (hex #d4b080), calm gentle soft features without sharp angles, kind thoughtful medium dark brown eyes with a hint of sadness, thin neatly groomed dark beard trimmed close along jawline, straight nose, wearing white royal garments with minimal thin gold chain and small gold earrings befitting a dharmic king, simple golden band crown on head",
  // ── Additional major characters ──
  radha: "Srimati Radharani: the supreme FEMALE goddess aged 16-18 (NO beard NO facial hair) with perfectly golden molten-gold luminous complexion like stationary lightning (hex #f0d080), extraordinarily beautiful lotus face, large doe-like dark brown eyes lined with black mascara with long curved lashes filled with divine love, long bow-shaped delicate arched eyebrows, exquisitely shaped straight thin nose with tiny diamond nose pin, nectar-like full crimson lips with enchanting smile, teeth like shining white pearls, delicately sculptured chin with droplet of musk, lustrous luxuriant long black hair past her waist beautifully braided decorated with forest flowers jasmine garlands and gold ornaments, red kunkum on forehead, vermillion sindoor, wearing radiant blue silk sari with gold embroidery and intricate Gota Patti work, shimmering bodice, necklace of finest pearls, glittering earrings, gem-encrusted armlets, jeweled bracelets, golden ankle-bells, gold waist chain (kamarband), slender waist with three exquisite folds",
  balarama: "Lord Balarama (Haladhara — plough bearer, Sankarshana): a powerful muscular MALE young man aged 25-28 with fair white complexion (hex #e8d4b0) — Vishnu's white hair became Balarama while black became Krishna, broad strong masculine face, intense large dark brown eyes with reddish tinge, wearing blue garments, single gold earring, garland of forest flowers, dark hair in topknot with earrings bracelets and armlets, carrying his plough weapon (Balachita/Hala) on powerful right shoulder and heavy mace (musala) in left, golden armlets on immensely powerful arms, greatest mace fighter of his era who trained Duryodhana, incarnation of Shesha-naga serpent",
  devaki: "Mother Devaki: a beautiful noble Indian woman aged 30-35 with fair radiant complexion (hex #e0c8a0), gentle maternal face with large expressive dark eyes filled with both love and sorrow, straight nose, wearing a modest silk sari in green and gold, minimal gold jewelry, hair covered with pallu, sitting gracefully with folded hands in devotion",
  vasudeva: "King Vasudeva: a noble dignified Indian man aged 40-45 with broad strong face, medium-dark complexion (hex #9a7a50), thick dark beard and mustache, determined courageous dark brown eyes, wearing royal but simple garments, gold armlets and earrings, tall strong build befitting a Yadava prince",
  kamsa: "King Kamsa: a fearsome tyrant aged 35-40 with harsh angular face, dark complexion (hex #5a3a20), cruel narrow dark eyes with heavy brows, thick black beard, large hooked nose, muscular imposing build, wearing royal black and red garments with heavy gold ornaments, golden crown, sneering cruel expression showing arrogance and fear",
  uddhava: "Uddhava: a devoted young man aged 25-30 with gentle refined face, fair complexion (hex #d4b080), soft thoughtful dark brown eyes filled with devotion, clean-shaven smooth face, neat dark hair, wearing simple yellow silk dhoti and uttariya, carrying a lotus flower, Vaishnava tilak on forehead, slim graceful build",
  rukmini: "Queen Rukmini: a stunningly beautiful young Indian queen aged 20-22 with golden-fair complexion (hex #e8c890), perfectly symmetrical lotus face, large luminous dark brown eyes with kajal, delicate nose with gold nose ring, full lips with serene regal smile, lustrous long black hair in elaborate braid with gold ornaments and flowers, wearing rich silk sari in red and gold with heavy bridal jewelry, gold necklace, jhumka earrings, bangles",
  nanda: "Nanda Maharaja: a prosperous elderly cowherd chief aged 55-60 with round jolly face, warm tanned complexion (hex #c49060), kind smiling dark brown eyes with laugh lines, short grey beard, broad nose, wearing simple white dhoti and uttariya cloth, rudraksha mala around neck, turban on head, sturdy build of a farmer",
  shiva: "Lord Shiva (Mahadeva): an ascetic MALE divine being aged ageless with three matted grey-brown jata dreadlocks piled high with Goddess Ganga flowing from the locks, third eye on forehead capable of burning destruction, crescent moon tucked in hair, fair ashen-white complexion (hex #c0b090) smeared all over with sacred vibhuti ash from cremation grounds, half-closed deep meditative dark brown eyes, blue throat (neelkantha) from holding halahala poison, wearing tiger skin around waist symbolizing victory over ego, sacred rudraksha beads, serpent Vasuki coiled around neck, small damaru hand-drum, carrying mighty trident (trishul) representing creator-preserver-destroyer, sitting in meditation on tiger skin, Nandi bull companion nearby",
  duryodhana: "Prince Duryodhana: a powerful arrogant young king aged 30-35 with broad aggressive face, fair complexion (hex #d4b080), angry intense dark brown eyes with thick eyebrows, strong square jaw, neatly trimmed dark beard, wearing rich royal red and gold garments with heavy gold ornaments, golden crown, carrying a mace, muscular imposing warrior build with proud bearing",
};

// Short persona summaries for image prompts (FLUX.2-pro has ~800 char limit)
// Full descriptions in CHARACTER_PERSONAS are kept for reference and face bank
const PERSONA_SHORT: Record<string, string> = {
  krishna_adult: "Lord Krishna: MALE deity young man (strong masculine jawline, broad shoulders, bare masculine chest, muscular arms, NO feminine features, NOT a woman), deep blue skin like rain cloud, peacock feather and blue karnikara flowers in curly black hair, golden mukut crown, brilliant yellow silk pitambara dhoti, Kaustubha gem on chest, Vaijayanti garland of five-colored flowers reaching knees, bamboo flute in hand",
  krishna_child: "Baby Krishna: MALE divine infant boy, chubby blue-tinted, tiny peacock feather, gold anklets, playful smile",
  narada: "Sage Narada: MALE sage man (masculine face, strong jawline, NO feminine features, NOT a woman), fair wheat-toned skin, clean-shaven, happy chanting countenance, white U-shaped Vaishnava tilak, grey-streaked topknot, bare male chest with sacred thread and bead garland, white dhoti, carrying tanpura veena (mahathi) and khartal cymbals, always chanting Narayana",
  vyasa: "Sage Vyasa: majestic dark-skinned elderly rishi, long silver-white beard, matted grey dreadlocks, bark-cloth garment, rudraksha mala",
  suta_goswami: "Suta Goswami: elderly fair sage, short white beard, bald crown, saffron silk robes, rudraksha mala",
  shukadeva: "Shukadeva Goswami: radiant young bald sage aged 16, luminous fair skin, large innocent eyes, simple white cloth, no ornaments",
  arjuna: "Arjuna (Kiriti): tall muscular MALE warrior prince, sinewy broad shoulders, dark hair in tight topknot, celestial golden diadem from Indra, golden armor, twin quivers, carrying mighty Gandiva bow, chariot with Hanuman banner",
  vishnu: "Lord Vishnu: royal blue-skinned MALE divine being, four arms holding conch Panchajanya discus Sudarshana mace Kaumodaki lotus, tall golden kirita-mukut crown, yellow silk pitambara, Kaustubha gem, Vaijayanti tulsi garland, Srivatsa mark on chest",
  brahma: "Lord Brahma: four-faced creator god, white beard, red-golden robes, holding Vedas and water pot",
  prahlada: "Prahlada: young boy aged 6-7, warm brown skin, innocent devotional eyes, simple white kurta, tulsi mala",
  narasimha: "Lord Narasimha: fierce half-lion half-man, golden lion mane, blue-skinned muscular torso, blazing golden eyes, sharp fangs",
  parikshit: "King Parikshit: dignified middle-aged king, short dark beard, white renunciation cloth, sitting cross-legged",
  yashoda: "Mother Yashoda: beautiful middle-aged FEMALE woman (NO beard NO facial hair), loving smooth feminine face, dark hair with red sindoor, maroon silk sari with gold border",
  kunti: "Queen Kunti: dignified elderly FEMALE woman (NO beard NO facial hair), greying hair in bun, white and gold silk sari, sorrowful gentle feminine eyes",
  draupadi: "Draupadi (Krishnaa): beautiful young FEMALE woman (NO beard NO facial hair), dark olive-brown skin like night (called Krishnaa for dark beauty), lotus-petal eyes with kajal, smooth feminine face, thick black wavy-curly hair with jasmine and blue locks, red and gold silk sari, gold choker with ruby",
  gandhari: "Queen Gandhari: elderly FEMALE woman (NO beard NO facial hair) with white silk blindfold over eyes, white sari, greying hair covered with pallu",
  dhritarashtra: "King Dhritarashtra: very old blind king, closed sunken eyes, long white beard, white garments, wooden walking staff",
  vidura: "Vidura: wise dark-skinned middle-aged man, short grey beard, saffron dhoti, pilgrim's walking staff",
  bhishma: "Bhishma Pitamah (Gauranga): majestic fair-bodied elderly MALE warrior, silver-white hair, long white beard, invincible son of Ganga, silver armor, lying on raised bed of arrows piercing entire body",
  yudhishthira: "King Yudhishthira: fair gentle-faced king, thin dark beard, white royal garments, simple golden crown",
  radha: "Srimati Radharani: molten-gold luminous complexioned FEMALE goddess (NO beard NO facial hair), large doe eyes with black mascara, bow-shaped brows, smooth feminine face, teeth like pearls, luxuriant black hair past waist with forest flowers, blue silk sari with gold Gota Patti work, pearl necklace, golden ankle-bells, red kunkum on forehead",
  balarama: "Lord Balarama (Haladhara): fair white muscular MALE young man, blue garments, single earring, forest flower garland, topknot, carrying plough (Balachita) on shoulder and heavy mace, Shesha-naga incarnation, greatest mace fighter",
  devaki: "Mother Devaki: beautiful noble FEMALE woman (NO beard NO facial hair), gentle maternal smooth feminine face, green and gold sari, folded hands",
  vasudeva: "King Vasudeva: noble strong man, thick dark beard, royal garments, gold armlets, Yadava prince",
  kamsa: "King Kamsa: fearsome tyrant, dark complexion, cruel eyes, black and red royal garments, golden crown",
  uddhava: "Uddhava: devoted young man, fair, clean-shaven, yellow silk dhoti, carrying lotus, Vaishnava tilak",
  rukmini: "Queen Rukmini: beautiful golden-fair FEMALE queen (NO beard NO facial hair), large eyes with kajal, smooth feminine face, red and gold silk sari, heavy bridal jewelry",
  nanda: "Nanda Maharaja: jovial elderly cowherd, round face, grey beard, white dhoti, turban, sturdy farmer build",
  shiva: "Lord Shiva (Mahadeva): ascetic MALE with three matted jata dreadlocks with Ganga flowing from locks, third eye, crescent moon, ash-smeared white body (vibhuti), blue throat (neelkantha), tiger skin, damaru drum, serpent Vasuki, trident (trishul), Nandi bull nearby",
  duryodhana: "Prince Duryodhana: arrogant MALE warrior king, broad aggressive face, dark beard, 'lightning made flesh' body, red and gold royal garments, golden crown, carrying heavy mace (gada), greatest mace fighter trained by Balarama",
};

// ── Custom Personas — user-defined characters loaded from JSON file ────────
// Users can add new characters here without modifying code.
// File: data/bhagwatham/custom-personas.json
const CUSTOM_PERSONAS_FILE = path.join(DATA_DIR, "custom-personas.json");

interface CustomPersona {
  key: string;              // e.g. "indra", "garuda"
  name: string;             // Display name: "Lord Indra"
  fullDescription: string;  // Full CHARACTER_PERSONAS-style description
  shortDescription: string; // PERSONA_SHORT-style description for image prompts
  patterns: string[];       // Regex patterns to detect in scene text: ["\\bIndra\\b"]
  gender: "male" | "female";
  source?: string;          // Where the visual reference came from
  addedAt?: string;
}

function readCustomPersonas(): CustomPersona[] {
  if (!fs.existsSync(CUSTOM_PERSONAS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(CUSTOM_PERSONAS_FILE, "utf-8")); }
  catch { return []; }
}

function writeCustomPersonas(personas: CustomPersona[]): void {
  fs.writeFileSync(CUSTOM_PERSONAS_FILE, JSON.stringify(personas, null, 2) + "\n");
}

/** Add or update a custom persona */
export function upsertCustomPersona(persona: CustomPersona): { success: boolean; isNew: boolean } {
  const personas = readCustomPersonas();
  const idx = personas.findIndex(p => p.key === persona.key);
  persona.addedAt = persona.addedAt || new Date().toISOString();

  if (idx >= 0) {
    personas[idx] = persona;
    writeCustomPersonas(personas);
    CHARACTER_PERSONAS[persona.key] = persona.fullDescription;
    PERSONA_SHORT[persona.key] = persona.shortDescription;
    logger.info({ key: persona.key, name: persona.name }, "Custom persona updated");
    return { success: true, isNew: false };
  }

  personas.push(persona);
  writeCustomPersonas(personas);
  CHARACTER_PERSONAS[persona.key] = persona.fullDescription;
  PERSONA_SHORT[persona.key] = persona.shortDescription;
  logger.info({ key: persona.key, name: persona.name }, "Custom persona added");
  return { success: true, isNew: true };
}

/** Remove a custom persona */
export function deleteCustomPersona(key: string): boolean {
  const personas = readCustomPersonas();
  const filtered = personas.filter(p => p.key !== key);
  if (filtered.length === personas.length) return false;
  writeCustomPersonas(filtered);
  delete CHARACTER_PERSONAS[key];
  delete PERSONA_SHORT[key];
  logger.info({ key }, "Custom persona deleted");
  return true;
}

/** Get all personas — built-in + custom */
export function getAllPersonas(): { builtIn: Record<string, string>; custom: CustomPersona[] } {
  return { builtIn: { ...CHARACTER_PERSONAS }, custom: readCustomPersonas() };
}

// Load custom personas into memory on module init
(function loadCustomPersonasOnInit() {
  const customs = readCustomPersonas();
  for (const p of customs) {
    CHARACTER_PERSONAS[p.key] = p.fullDescription;
    PERSONA_SHORT[p.key] = p.shortDescription;
  }
  if (customs.length > 0) {
    logger.info({ count: customs.length }, "Custom personas loaded into memory");
  }
})();

/** Look up which persona names appear in a scene prompt */
function injectPersona(scene: string): string {
  let result = scene;
  const checks: Array<[RegExp, string]> = [
    [/\bBaby\b.*\bKrishna\b/i, "krishna_child"],
    [/\b(?:child|infant|baby)\b.*\bKrishna\b/i, "krishna_child"],
    [/\bKrishna\b(?!.*\b(?:child|infant|baby)\b)/i, "krishna_adult"],
    [/\bNarada\b/i, "narada"],
    [/\bVyasa(?:deva)?\b/i, "vyasa"],
    [/\bSuta\s*Goswami\b/i, "suta_goswami"],
    [/\bShukadeva\b/i, "shukadeva"],
    [/\bArjuna\b/i, "arjuna"],
    [/\bVishnu\b/i, "vishnu"],
    [/\bBrahma\b/i, "brahma"],
    [/\bPrahlada?\b/i, "prahlada"],
    [/\bNarasimha\b|\bNrisimha\b/i, "narasimha"],
    [/\bParikshit\b/i, "parikshit"],
    [/\bYashoda\b/i, "yashoda"],
    [/\bKunti\b/i, "kunti"],
    [/\bDraupadi\b/i, "draupadi"],
    [/\bGandhari\b/i, "gandhari"],
    [/\bDhritarashtra\b/i, "dhritarashtra"],
    [/\bVidura\b/i, "vidura"],
    [/\bBhishma\b/i, "bhishma"],
    [/\bYudhishthira\b/i, "yudhishthira"],
    [/\bRadha(?:rani)?\b/i, "radha"],
    [/\bBalarama?\b|\bBaladeva\b/i, "balarama"],
    [/\bDevaki\b/i, "devaki"],
    [/\bVasudeva\b(?!.*\bKrishna\b)/i, "vasudeva"],
    [/\bKamsa\b|\bKansa\b/i, "kamsa"],
    [/\bUddhava\b/i, "uddhava"],
    [/\bRukmini\b/i, "rukmini"],
    [/\bNanda\s*(?:Maharaja)?\b/i, "nanda"],
    [/\bShiva\b|\bMahadeva\b/i, "shiva"],
    [/\bDuryodhana\b/i, "duryodhana"],
  ];

  // Also add custom persona patterns dynamically
  const customs = readCustomPersonas();
  for (const cp of customs) {
    for (const pat of cp.patterns) {
      try { checks.push([new RegExp(pat, "i"), cp.key]); }
      catch { /* skip invalid regex */ }
    }
  }

  // Collect ALL matching personas (short descriptions for prompt brevity)
  const matchedPersonas: string[] = [];
  for (const [pattern, key] of checks) {
    if (pattern.test(scene) && PERSONA_SHORT[key] && !matchedPersonas.includes(PERSONA_SHORT[key])) {
      matchedPersonas.push(PERSONA_SHORT[key]);
    }
  }

  if (matchedPersonas.length > 0) {
    // Prepend only matched personas (short versions to stay within prompt limit)
    result = `${matchedPersonas.join(". ")}. Scene: ${scene}`;
  }
  return result;
}

/** Detect which persona keys appear in a scene prompt */
function detectPersonasInScene(scene: string): string[] {
  const found: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/\bBaby\b.*\bKrishna\b|\bchild\b.*\bKrishna\b|\binfant\b.*\bKrishna\b/i, "krishna_child"],
    [/\bKrishna\b/i, "krishna_adult"],
    [/\bNarada\b/i, "narada"],
    [/\bVyasa(?:deva)?\b/i, "vyasa"],
    [/\bSuta\s*Goswami\b/i, "suta_goswami"],
    [/\bShukadeva\b/i, "shukadeva"],
    [/\bArjuna\b/i, "arjuna"],
    [/\bVishnu\b/i, "vishnu"],
    [/\bBrahma\b/i, "brahma"],
    [/\bPrahlada?\b/i, "prahlada"],
    [/\bNarasimha\b|\bNrisimha\b/i, "narasimha"],
    [/\bParikshit\b/i, "parikshit"],
    [/\bYashoda\b/i, "yashoda"],
    [/\bKunti\b/i, "kunti"],
    [/\bDraupadi\b/i, "draupadi"],
    [/\bGandhari\b/i, "gandhari"],
    [/\bDhritarashtra\b/i, "dhritarashtra"],
    [/\bVidura\b/i, "vidura"],
    [/\bBhishma\b/i, "bhishma"],
    [/\bYudhishthira\b/i, "yudhishthira"],
  ];
  for (const [pattern, key] of checks) {
    if (pattern.test(scene) && !found.includes(key)) {
      found.push(key);
    }
  }
  return found;
}

// ── Persona versioning ──────────────────────────────────────────────────────
// Each persona has a version number. When a persona is enhanced with new details,
// its version is bumped. The audit cron checks if any image uses an outdated
// persona version and queues regeneration.

const PERSONA_VERSION_FILE = path.join(DATA_DIR, "persona-versions.json");

interface PersonaVersions {
  versions: Record<string, number>;  // e.g. { "krishna_adult": 2, "kunti": 1 }
  lastUpdated: string;
  enhancementLog: Array<{
    persona: string;
    version: number;
    enhancement: string;
    timestamp: string;
  }>;
}

function readPersonaVersions(): PersonaVersions {
  if (!fs.existsSync(PERSONA_VERSION_FILE)) {
    // Initialize all personas at version 1
    const versions: Record<string, number> = {};
    for (const key of Object.keys(CHARACTER_PERSONAS)) {
      versions[key] = 1;
    }
    return { versions, lastUpdated: new Date().toISOString(), enhancementLog: [] };
  }
  return JSON.parse(fs.readFileSync(PERSONA_VERSION_FILE, "utf-8"));
}

function writePersonaVersions(pv: PersonaVersions): void {
  pv.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PERSONA_VERSION_FILE, JSON.stringify(pv, null, 2) + "\n");
}

/** Get the current version for a set of personas (max of their individual versions) */
function getPersonaGroupVersion(personaKeys: string[]): number {
  const pv = readPersonaVersions();
  return Math.max(...personaKeys.map((k) => pv.versions[k] || 1), 1);
}

/**
 * Enhance a persona with new information discovered during translation.
 * Bumps the version so the audit cron knows to regenerate affected images.
 */
export function enhancePersona(personaKey: string, enhancement: string): { success: boolean; newVersion: number; affectedImages: number } {
  if (!CHARACTER_PERSONAS[personaKey]) {
    return { success: false, newVersion: 0, affectedImages: 0 };
  }

  // Append new details to the persona
  CHARACTER_PERSONAS[personaKey] = `${CHARACTER_PERSONAS[personaKey]}, ${enhancement}`;

  // Bump version
  const pv = readPersonaVersions();
  const oldVersion = pv.versions[personaKey] || 1;
  const newVersion = oldVersion + 1;
  pv.versions[personaKey] = newVersion;
  pv.enhancementLog.push({
    persona: personaKey,
    version: newVersion,
    enhancement,
    timestamp: new Date().toISOString(),
  });
  writePersonaVersions(pv);

  // Count affected images in manifest
  const manifest = readManifest();
  const affected = manifest.images.filter((img) =>
    img.personasUsed?.includes(personaKey) && (img.personaVersion || 1) < newVersion
  ).length;

  logger.info({ personaKey, newVersion, affected, enhancement }, "Persona enhanced — audit will regenerate affected images");

  return { success: true, newVersion, affectedImages: affected };
}

export function getPersonaVersions(): PersonaVersions {
  return readPersonaVersions();
}

// ── Scene keywords → multiple scene prompts per theme ────────────────────────
// Each entry can produce multiple images (scenes) for a chapter.
const SCENE_KEYWORDS: Array<{ pattern: RegExp; scenes: string[] }> = [
  {
    pattern: /नैमिषारण्य|सूत.*गोस्वामी|मुनि.*जिज्ञासा/iu,
    scenes: [
      "Suta Goswami sitting on a stone seat under a large banyan tree, speaking to a small group of five or six sages seated on grass mats around a modest sacred fire, ancient Naimisharanya forest with tall trees and dappled golden sunlight filtering through leaves, wide landscape view, realistic natural setting",
      "Suta Goswami in mid-gesture while teaching, warm firelight illuminating his face, two sages in foreground listening attentively with folded hands, forest clearing at dusk, realistic proportions and natural lighting",
    ],
  },
  {
    pattern: /दिव्यता.*दिव्य\s*सेवा|व्यास\s*उवाच/iu,
    scenes: [
      "Vyasadeva sitting cross-legged on a deerskin mat inside a simple thatched forest hermitage, writing on palm-leaf manuscripts with a reed stylus, golden morning light streaming through the doorway, ink pot and stack of manuscripts beside him, realistic rustic ashram interior, wide landscape composition",
      "Vyasadeva meditating peacefully under a massive ancient banyan tree with aerial roots, a small stream flowing nearby, birds perched on branches, early morning mist in the forest, natural realistic landscape",
    ],
  },
  {
    pattern: /कृष्ण.*अवतार|समस्त\s*अवतार|अवतारों.*स्रोत/iu,
    scenes: [
      "Lord Krishna standing gracefully in a lush Vrindavan meadow playing his bamboo flute, two peacocks nearby, a gentle river flowing in the background, flowering trees, warm golden hour sunlight, wide cinematic landscape composition",
      "Lord Krishna seated under a kadamba tree in a serene forest glade, three cows resting nearby, lotus pond in foreground reflecting golden sky, Vrindavan hills in the distance, natural realistic landscape wallpaper",
    ],
  },
  {
    pattern: /नारद.*प्राकट्य|नारद|श्री\s*नारद/iu,
    scenes: [
      "Sage Narada walking along a mountain path at sunrise, playing his tanpura veena, vast panoramic Himalayan landscape stretching behind him, golden clouds and snow-capped peaks, two eagles soaring in the sky, wide cinematic landscape",
      "Sage Narada resting on a rocky outcrop above the clouds, his veena leaning beside him, gazing at a spectacular sunset over a valley of rivers and forests, birds in flight, peaceful wide landscape",
    ],
  },
  {
    pattern: /कृष्ण.*गोपी|गोपी.*कृष्ण|रास\s*लीला/iu,
    scenes: [
      "Lord Krishna and Radha dancing together in a moonlit Vrindavan clearing beside the Yamuna river, full moon reflecting on calm water, three or four gopis watching joyfully from the side, fireflies glowing, wide landscape with forest silhouette",
      "Krishna playing flute on the bank of Yamuna river at night, Radha and two gopis listening from nearby, full moon overhead, lotus flowers floating on water, serene wide landscape composition",
    ],
  },
  {
    pattern: /कृष्ण.*बंसी|बंसी.*कृष्ण|वेणु|मुरली|बाँसुरी/iu,
    scenes: [
      "Lord Krishna leaning against a flowering kadamba tree playing bamboo flute, three white cows grazing nearby, a peacock with spread feathers on the ground, rolling green Vrindavan meadows stretching to horizon, warm golden sunset, wide landscape",
      "Krishna seated on a rock by a gentle stream playing flute, two deer and a peacock listening nearby, Vrindavan forest in background with birds in flight, soft golden light, natural wide landscape wallpaper",
    ],
  },
  {
    pattern: /गोवर्धन|गिरिराज/iu,
    scenes: [
      "Young Lord Krishna lifting Govardhan hill on his little finger, a small group of villagers with two cows sheltering underneath, dramatic dark storm clouds with rain on one side and golden light on the other, wide cinematic landscape composition",
    ],
  },
  {
    pattern: /कालिय|नाग/iu,
    scenes: [
      "Lord Krishna standing triumphantly on the multi-hooded serpent Kaliya in the Yamuna river, wide river landscape with forested banks on both sides, dramatic sky, two villagers watching from the riverbank, cinematic wide composition",
    ],
  },
  {
    pattern: /माखन.*चोर|दधि|मक्खन/iu,
    scenes: [
      "Baby Krishna reaching for a clay butter pot hanging from the ceiling in a rustic village kitchen, butter on his face, Mother Yashoda approaching from the doorway with a loving smile, realistic village home interior with earthen walls, warm lamp light, wide composition",
    ],
  },
  {
    pattern: /यशोदा|माता.*कृष्ण|बाल.*कृष्ण/iu,
    scenes: [
      "Mother Yashoda cradling baby Krishna in her lap in a sunlit courtyard, blooming jasmine creeper on the wall, a brass lamp nearby, two peacocks in the garden, warm realistic domestic scene, wide landscape composition",
      "Baby Krishna crawling playfully in a sunny village courtyard, Mother Yashoda watching from the verandah doorway, a cow resting in the shade nearby, realistic rural Indian setting, warm golden light, wide composition",
    ],
  },
  {
    pattern: /अर्जुन|गीता|कुरुक्षेत्र|रथ/iu,
    scenes: [
      "Krishna and Arjuna on a golden chariot drawn by four white horses, positioned between two distant armies on the vast Kurukshetra plain, dramatic sky with rays of sunlight breaking through clouds, wide cinematic panoramic landscape",
      "Krishna speaking to Arjuna on the chariot, gesturing with one hand, Arjuna listening with bow resting at his side, the vast empty battlefield stretching to the horizon, dramatic sunset sky, wide landscape",
    ],
  },
  {
    pattern: /विष्णु|वैकुण्ठ|शेषनाग|शेष/iu,
    scenes: [
      "Lord Vishnu reclining peacefully on Shesha Naga serpent floating on a vast calm cosmic ocean, Goddess Lakshmi at his feet, a golden lotus growing from his navel reaching toward a sky filled with stars, wide panoramic cosmic landscape",
    ],
  },
  {
    pattern: /ब्रह्मा.*सृष्टि|सृष्टि|सर्ग/iu,
    scenes: [
      "Lord Brahma seated on a golden lotus flower in a vast cosmic space, galaxies and nebulae forming around him, golden light emanating outward, the lotus stem descending into an infinite ocean below, wide cosmic panoramic landscape",
    ],
  },
  {
    pattern: /प्रह्लाद|हिरण्यकशिपु|नरसिंह|नृसिंह/iu,
    scenes: [
      "Lord Narasimha emerging from a cracked palace pillar in a grand throne room, young Prahlada watching with calm folded hands from nearby, dramatic lighting with golden divine glow contrasting dark palace interior, wide cinematic composition",
      "Young boy Prahlada meditating peacefully in a dark palace chamber, a faint golden protective aura around him, single oil lamp flickering nearby, moonlight from a high window, realistic interior, wide landscape composition",
    ],
  },
  {
    pattern: /शुकदेव|परीक्षित/iu,
    scenes: [
      "Young sage Shukadeva on a simple raised seat narrating to King Parikshit, four or five sages listening nearby, on the banks of the wide Ganges river at sunset, temple spires visible in the distance, realistic wide riverside landscape",
    ],
  },
  {
    pattern: /धर्म|कलियुग|कलि/iu,
    scenes: [
      "A majestic white bull standing weakly on one leg on a barren dusty plain, a cow nearby looking sorrowful, dark storm clouds gathering on the horizon with a single ray of golden light breaking through, wide dramatic landscape",
    ],
  },
];

// ── Fallback scenes ──────────────────────────────────────────────────────────
const GENERIC_SCENES = [
  "Lord Krishna standing in a lush Vrindavan meadow playing flute, peacocks nearby, river flowing in background, golden sunset, wide cinematic landscape wallpaper",
  "A sacred Vedic fire ceremony in a forest clearing, three sages seated around a modest fire, smoke rising into golden sky through tree canopy, wide natural landscape",
  "Magnificent Vaikuntha palace with golden architecture reflected in a crystal lotus pond, ethereal clouds, two peacocks on marble balustrade, wide panoramic landscape",
  "A sage meditating alone in a Himalayan ashram, majestic snow peaks in background, waterfall cascading nearby, golden sunrise, wide mountain landscape",
  "Lord Krishna standing at the entrance of a lamp-lit temple at dusk, lotus flowers in foreground, devotional atmosphere, wide landscape composition",
  "Vrindavan forest landscape with sacred white cows grazing under blossoming trees, a peacock on a branch, lotus pond reflecting golden sky, Yamuna river winding into distance, wide wallpaper",
  "Vast cosmic scene with Lord Vishnu at center, stars and galaxies swirling around, divine golden effulgence, wide panoramic cosmic landscape",
  "Sacred Ganges flowing from celestial realms, sages performing rituals on stone ghats, temple spires silhouetted against golden sunrise",
];

// ── Manifest types ────────────────────────────────────────────────────────────

export interface ChapterImage {
  chapterNumber: number;
  chapterTitle: string;
  cantoNumber?: number;        // skandh/canto (1-12) for gallery grouping
  imagePath: string;
  prompt: string;
  descriptionHi?: string;
  personasUsed?: string[];     // e.g. ["krishna_adult", "kunti"] — tracks which personas were used
  personaVersion?: number;     // incremented when any used persona is enhanced
  generatedAt: string;
  sceneIndex?: number; // 0, 1, 2... for multiple images per chapter
}

export interface ImageManifest {
  images: ChapterImage[];
  lastUpdated: string;
}

// ── Face Bank — character face consistency ───────────────────────────────────

const FACES_DIR = path.join(DATA_DIR, "faces");
const FACE_MANIFEST = path.join(FACES_DIR, "face-manifest.json");

interface FaceEntry {
  characterName: string;
  imagePath: string;   // relative to faces dir
  generatedAt: string;
}

function readFaceManifest(): FaceEntry[] {
  if (!fs.existsSync(FACE_MANIFEST)) return [];
  return JSON.parse(fs.readFileSync(FACE_MANIFEST, "utf-8"));
}

function writeFaceManifest(entries: FaceEntry[]): void {
  if (!fs.existsSync(FACES_DIR)) fs.mkdirSync(FACES_DIR, { recursive: true });
  fs.writeFileSync(FACE_MANIFEST, JSON.stringify(entries, null, 2) + "\n");
}

/** Get public URLs of canonical face images for characters detected in the scene */
function getFaceReferenceUrls(scene: string): string[] {
  const faces = readFaceManifest();
  if (faces.length === 0) return [];

  const baseUrl = process.env.PUBLIC_URL || "http://localhost:3001/api/bhagwatham/faces";
  const urls: string[] = [];

  const charPatterns: Array<[RegExp, string]> = [
    [/\bBaby\b.*\bKrishna\b|\bchild\b.*\bKrishna\b/i, "krishna_child"],
    [/\bKrishna\b/i, "krishna_adult"],
    [/\bNarada\b/i, "narada"],
    [/\bVyasa(?:deva)?\b/i, "vyasadeva"],
    [/\bSuta\s*Goswami\b/i, "suta_goswami"],
    [/\bShukadeva\b/i, "shukadeva"],
    [/\bArjuna\b/i, "arjuna"],
    [/\bYashoda\b/i, "yashoda"],
    [/\bParikshit\b/i, "parikshit"],
    [/\bVishnu\b/i, "vishnu"],
    [/\bBrahma\b/i, "brahma"],
    [/\bPrahlad/i, "prahlada"],
    [/\bNarasimha\b|\bNrisimha\b/i, "narasimha"],
    [/\bKunti\b/i, "kunti"],
    [/\bDraupadi\b/i, "draupadi"],
    [/\bGandhari\b/i, "gandhari"],
    [/\bDhritarashtra\b/i, "dhritarashtra"],
    [/\bVidura\b/i, "vidura"],
    [/\bBhishma\b/i, "bhishma"],
    [/\bYudhishthira\b/i, "yudhishthira"],
  ];

  for (const [pattern, charName] of charPatterns) {
    if (pattern.test(scene)) {
      const face = faces.find(f => f.characterName === charName);
      if (face && fs.existsSync(path.join(FACES_DIR, face.imagePath))) {
        urls.push(`${baseUrl}/${face.imagePath}`);
      }
    }
  }
  return urls;
}

// ── Core functions ────────────────────────────────────────────────────────────

function ensureImageDir(): void {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Simple async mutex to prevent concurrent manifest corruption
let _manifestLock: Promise<void> = Promise.resolve();
function withManifestLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _manifestLock;
  let resolve: () => void;
  _manifestLock = new Promise<void>((r) => { resolve = r; });
  return prev.then(fn).finally(() => resolve!());
}

function readManifest(): ImageManifest {
  ensureImageDir();
  if (!fs.existsSync(MANIFEST_FILE)) return { images: [], lastUpdated: new Date().toISOString() };
  return JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8"));
}

function writeManifest(manifest: ImageManifest): void {
  ensureImageDir();
  manifest.lastUpdated = new Date().toISOString();
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");
}

export function getImageManifest(): ImageManifest {
  return readManifest();
}

// ── Scene detection — returns multiple scenes ────────────────────────────────

// ── Content-aware story extraction ──────────────────────────────────────────

/**
 * Extract the chapter subject line (Hindi title beneath the "Chapter X" heading).
 * e.g. "महारानी कुन्ती द्वारा प्रार्थना तथा परीक्षित की रक्षा"
 */
function extractChapterSubject(contentSnippet: string): string {
  const lines = contentSnippet.split("\n").map((l) => l.trim()).filter(Boolean);
  // The subject line is typically the first non-empty Devanagari line before "सूत उवाच" / shlok
  for (const line of lines.slice(0, 5)) {
    const devCount = (line.match(/[\u0900-\u097F]/gu) || []).length;
    const total = line.replace(/\s/g, "").length;
    if (
      devCount > 5 &&
      total > 0 &&
      devCount / total > 0.6 &&
      !/^(?:सूत|शौनक)\s*उवाच/u.test(line) &&
      !/॥/u.test(line) &&
      !/^शब्दार्थ/u.test(line) &&
      line.length > 10 &&
      line.length < 150
    ) {
      return line;
    }
  }
  return "";
}

/**
 * Extract key story elements from tatparya (commentary) sections.
 * These contain the actual narrative in Hindi prose.
 */
export function extractTatparyaStory(contentSnippet: string): string[] {
  const stories: string[] = [];
  const lines = contentSnippet.split("\n");
  let inTatparya = false;
  let currentStory = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^तात्पर्य/u.test(trimmed)) {
      if (currentStory.length > 30) stories.push(currentStory.trim());
      inTatparya = true;
      currentStory = trimmed.replace(/^तात्पर्य\s*:?\s*/u, "");
      continue;
    }
    if (/^शब्दार्थ/u.test(trimmed) || /^अनुवाद/u.test(trimmed)) {
      if (inTatparya && currentStory.length > 30) stories.push(currentStory.trim());
      inTatparya = false;
      currentStory = "";
      continue;
    }
    if (/॥/u.test(trimmed) && trimmed.length < 200) {
      if (inTatparya && currentStory.length > 30) stories.push(currentStory.trim());
      inTatparya = false;
      currentStory = "";
      continue;
    }
    if (inTatparya) {
      currentStory += " " + trimmed;
    }
  }
  if (inTatparya && currentStory.length > 30) stories.push(currentStory.trim());

  return stories;
}

/**
 * Extract shabdarth (word meanings) to identify key characters and actions.
 */
function extractCharactersFromShabdarth(contentSnippet: string): string[] {
  const characters: string[] = [];
  const charPatterns: Array<[RegExp, string]> = [
    [/कृष्ण/u, "Krishna"],
    [/अर्जुन|धनञ्जय/u, "Arjuna"],
    [/भीष्म/u, "Bhishma"],
    [/युधिष्ठिर/u, "Yudhishthira"],
    [/द्रौपदी|कृष्णा/u, "Draupadi"],
    [/कुन्ती|पृथा/u, "Kunti"],
    [/धृतराष्ट्र/u, "Dhritarashtra"],
    [/गान्धारी|गांधारी/u, "Gandhari"],
    [/विदुर/u, "Vidura"],
    [/व्यास/u, "Vyasa"],
    [/परीक्षित/u, "Parikshit"],
    [/अश्वत्थामा/u, "Ashwatthama"],
    [/शुकदेव/u, "Shukadeva"],
    [/नारद/u, "Narada"],
    [/ब्रह्मा/u, "Brahma"],
    [/विष्णु/u, "Vishnu"],
    [/उत्तरा/u, "Uttara"],
    [/सूत.*गोस्वामी/u, "Suta Goswami"],
  ];

  for (const [pat, name] of charPatterns) {
    if (pat.test(contentSnippet) && !characters.includes(name)) {
      characters.push(name);
    }
  }
  return characters.slice(0, 5);
}

/**
 * Use Claude to summarize chapter content and generate a rich, detailed scene prompt.
 * Falls back to rule-based scene detection if Claude is unavailable.
 */
export async function buildAIScenePrompt(
  chapterTitle: string,
  contentSnippet: string,
): Promise<{ scene: string; descriptionHi: string } | null> {
  const characters = extractCharactersFromShabdarth(contentSnippet);
  const charList = characters.length > 0 ? `Characters present: ${characters.join(", ")}` : "";

  const systemPrompt = `You summarize chapters from the Srimad Bhagavatam and create image prompts. Respond ONLY with valid JSON.`;

  const userPrompt = `Chapter title: ${chapterTitle}
${charList}

Chapter content (Hindi/Sanskrit):
${contentSnippet.substring(0, 3000)}

Read the chapter content above carefully and do TWO things:

1. **summary_hi**: Write a 2-3 sentence Hindi summary of this chapter — what is the key event, who are the main characters, and what is the emotional/spiritual significance.

2. **scene_prompt**: Based on your summary, write a concise English scene description (40-60 words) of the single most important moment from this chapter. Focus on:
   - WHO: Name the characters involved (use their proper names like Krishna, Vyasa, Narada, Arjuna, etc.)
   - WHAT: The key action or event happening
   - WHERE: The setting (forest, palace, riverbank, battlefield, etc.)
   Keep it simple and narrative-focused. Do NOT include style instructions, camera angles, or composition directions — just describe the scene as a story moment.
   IMPORTANT: Avoid violent, aggressive, or graphic language (no "beating", "killing", "blood", "brutally", etc.). Describe conflicts in a dignified, serene way suitable for devotional art.

IMPORTANT: The scene_prompt must be ENGLISH ONLY. No Hindi/Sanskrit text.

Respond in this exact JSON format only:
{"summary_hi": "...", "scene_prompt": "..."}`;

  // COST OPTIMIZATION: Try Together AI first (Llama 3.3 ~10× cheaper than Claude Sonnet).
  // Fall back to Claude Haiku (12× cheaper than Sonnet) if Together fails.
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const togetherKey = process.env.TOGETHER_API_KEY;

  if (togetherKey) {
    try {
      const res = await fetch("https://api.together.xyz/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${togetherKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 600,
          temperature: 0.7,
        }),
      });
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content || "";
      const result = parseSceneJSON(text);
      if (result) {
        logger.info({ chapterTitle, engine: "together-llama" }, "AI scene prompt generated");
        return result;
      }
    } catch (err) {
      logger.warn({ err, chapterTitle }, "Together AI scene generation failed, trying Claude Haiku fallback");
    }
  }

  if (anthropicKey) {
    try {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-haiku-4-5", // ← cheap fallback (was claude-sonnet-4-6)
        max_tokens: 600,
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const result = parseSceneJSON(text);
      if (result) {
        logger.info({ chapterTitle, engine: "anthropic-haiku" }, "AI scene prompt generated (fallback)");
        return result;
      }
    } catch (err) {
      logger.warn({ err, chapterTitle }, "Anthropic Haiku scene generation failed");
    }
  }

  logger.info({ chapterTitle }, "No AI keys available for scene generation, using rules");
  return null;
}

function parseSceneJSON(text: string): { scene: string; descriptionHi: string } | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.scene_prompt && parsed.summary_hi) {
      return { scene: parsed.scene_prompt, descriptionHi: parsed.summary_hi };
    }
  } catch { /* invalid JSON */ }
  return null;
}

/**
 * Build a scene description from the actual chapter content.
 * Returns both the English scene prompt and a Hindi description.
 * Tries AI-powered scene generation first, falls back to rule-based.
 */
function buildContentAwareScene(
  chapterTitle: string,
  contentSnippet: string,
): { scene: string; descriptionHi: string }[] {
  const subject = extractChapterSubject(contentSnippet);
  const stories = extractTatparyaStory(contentSnippet);
  const characters = extractCharactersFromShabdarth(contentSnippet);

  const results: { scene: string; descriptionHi: string }[] = [];

  // Scene 1: Main chapter theme — try SUBJECT_SCENES first for high-quality curated scenes
  const combined = `${subject} ${contentSnippet.substring(0, 500)}`;
  let scene1FromSubject = false;
  for (const { pattern, scenes } of SUBJECT_SCENES) {
    if (pattern.test(combined)) {
      results.push({ scene: scenes[0], descriptionHi: subject || chapterTitle });
      // If there's a second curated scene, use it as scene 2
      if (scenes.length > 1) {
        const storyDesc = stories.length > 0
          ? (stories[0].length > 120 ? stories[0].slice(0, 117) + "…" : stories[0])
          : subject || chapterTitle;
        results.push({ scene: scenes[1], descriptionHi: storyDesc });
      }
      scene1FromSubject = true;
      break;
    }
  }

  if (!scene1FromSubject && subject) {
    const charStr = characters.slice(0, 3).join(", ");
    const scene = translateSubjectToScene(subject, charStr, contentSnippet);
    results.push({ scene, descriptionHi: subject });
  }

  // Scene 2: From the most descriptive tatparya story (if we don't already have 2 scenes)
  if (results.length < 2 && stories.length > 0) {
    const bestStory = stories.sort((a, b) => b.length - a.length)[0];
    const storyScene = buildStoryScene(bestStory, characters, contentSnippet);
    const storyDesc = bestStory.length > 120 ? bestStory.slice(0, 117) + "…" : bestStory;
    if (storyScene && (!results[0] || storyScene !== results[0].scene)) {
      results.push({ scene: storyScene, descriptionHi: storyDesc });
    }
  }

  return results.slice(0, 2);
}

/**
 * Map Hindi chapter subjects to English scene descriptions.
 * All prompts must be ENGLISH ONLY (no Hindi), concise, and visually specific —
 * matching the quality of SCENE_KEYWORDS prompts used for chapters 1-7.
 */
const SUBJECT_SCENES: Array<{ pattern: RegExp; scenes: string[] }> = [
  {
    pattern: /कुन्ती|पृथा.*प्रार्थना/u,
    scenes: [
      "An elderly Indian queen mother in a white and gold sari kneeling with folded hands praying to blue-skinned Lord Krishna who stands on a golden chariot, her five warrior sons the Pandavas standing behind her respectfully, on the bank of the sacred Ganges river at golden sunset, wide cinematic landscape",
      "Royal Indian women in white saris performing sacred water rituals on the ancient stone ghats of the Ganges river at sunset, priests chanting nearby, golden light reflecting on the holy water, wide landscape",
    ],
  },
  {
    pattern: /परीक्षित.*रक्षा/u,
    scenes: [
      "Lord Krishna's glowing golden Sudarshana chakra spinning above a young Indian princess to protect her unborn child, divine golden radiance filling an ornate palace chamber, anxious royal family watching, wide cinematic composition",
      "An elderly Indian queen mother in a white and gold sari kneeling with folded hands praying to blue-skinned Lord Krishna who stands on a golden chariot, her five warrior sons the Pandavas standing behind her respectfully, on the bank of the sacred Ganges river at golden sunset, wide cinematic landscape",
    ],
  },
  {
    pattern: /परीक्षित.*जन्म/u,
    scenes: [
      "A divine newborn baby glowing with golden light in a grand palace chamber, royal family gathered around with joy, priests performing blessing rituals with sacred fire, wide cinematic composition",
      "Young sage Shukadeva narrating to King Parikshit on the banks of the wide Ganges river, four sages listening nearby, temple spires in the distance, golden sunset, wide landscape",
    ],
  },
  {
    pattern: /भीष्म.*देह.*त्याग|भीष्म.*शर/u,
    scenes: [
      "Bhishma lying serenely on a bed of arrows on the vast Kurukshetra battlefield, Lord Krishna and the five Pandava princes standing around him with reverence, golden sunset sky, wide dramatic landscape",
      "Bhishma speaking his final words of wisdom from his bed of arrows, sages and warriors gathered around listening, rays of golden light breaking through dramatic clouds above, wide landscape",
    ],
  },
  {
    pattern: /द्वारका.*प्रवेश|कृष्ण.*द्वारका.*प्रवेश/u,
    scenes: [
      "Lord Krishna entering the magnificent golden city of Dwarka on a grand chariot, citizens throwing flowers from ornate balconies, golden domes and spires, ocean in the background, festive wide landscape",
      "Lord Krishna blowing the divine conch Panchajanya with radiant golden light, citizens of Dwarka gathered joyfully on the streets, magnificent golden city architecture, ocean waves, wide landscape",
    ],
  },
  {
    pattern: /द्वारका.*प्रस्थान|कृष्ण.*प्रस्थान|कृष्ण.*द्वारका/u,
    scenes: [
      "Lord Krishna departing on a golden chariot from Hastinapura, the Pandava family watching from the palace steps with tearful eyes, dramatic golden sunset sky, ancient city architecture, wide cinematic landscape",
      "Lord Krishna's grand chariot with four white horses traveling along a river road toward the distant golden city of Dwarka, rolling green plains, dramatic sky with golden clouds, wide panoramic landscape",
    ],
  },
  {
    pattern: /धृतराष्ट्र.*गृह.*त्याग|धृतराष्ट्र.*त्याग/u,
    scenes: [
      "Blind old king Dhritarashtra and queen Gandhari in simple white renunciation robes walking away from the grand Hastinapura palace toward the forest at dawn, Vidura guiding them with a gentle hand, wide cinematic landscape",
      "Vidura speaking earnestly to blind king Dhritarashtra in a grand palace hall by lamplight, urging him to renounce the world, dramatic shadows, wide cinematic composition",
    ],
  },
  {
    pattern: /विदुर.*तीर्थ|विदुर.*यात्रा|विदुर.*लौट/u,
    scenes: [
      "Sage Vidura walking along a peaceful river path at sunrise with a pilgrim's staff, Himalayan foothills in the background, birds in flight, serene wide landscape",
      "Vidura entering the gates of Hastinapura after a long pilgrimage, relatives greeting him with respect, ancient city architecture, golden morning light, wide landscape",
    ],
  },
  {
    pattern: /पाण्डव.*स्वर्गारोहण|पाण्डव.*प्रस्थान/u,
    scenes: [
      "The five Pandava brothers and Draupadi walking in a line toward snow-capped Himalayan peaks on their final journey, vast mountain landscape, golden dawn light, wide cinematic composition",
    ],
  },
  {
    pattern: /ब्रह्मास्त्र|अश्वत्थामा.*दण्ड/u,
    scenes: [
      "Arjuna on his chariot facing Ashwatthama's deadly Brahmastra weapon glowing with intense fire in the sky, Lord Krishna beside Arjuna with hand raised, dramatic battlefield, wide landscape",
    ],
  },
  {
    pattern: /द्रोणपुत्र|अश्वत्थामा/u,
    scenes: [
      "A warrior prince on horseback confronting a kneeling prisoner on a vast battlefield, dramatic sky, ancient Indian setting, wide cinematic landscape",
    ],
  },
];

function translateSubjectToScene(subject: string, characters: string, contentSnippet: string): string {
  // Check subject against specific patterns
  const combined = `${subject} ${contentSnippet.substring(0, 500)}`;
  for (const { pattern, scenes } of SUBJECT_SCENES) {
    if (pattern.test(combined)) {
      return scenes[0];
    }
  }

  // Fallback: build a visual English-only scene from detected characters
  // NEVER include Hindi text in prompts
  const charNames = extractCharactersFromShabdarth(contentSnippet);
  if (charNames.length > 0) {
    const primary = charNames[0];
    const secondary = charNames[1] || "";

    // Character-specific fallback scenes
    if (primary === "Krishna" || primary === "Vishnu") {
      return `Lord Krishna standing majestically in a palace courtyard, golden architecture, peacocks nearby, devotees gathered with folded hands, warm golden sunset light, wide cinematic landscape`;
    }
    if (primary === "Arjuna") {
      return `Arjuna standing beside Lord Krishna with the mighty Gandiva bow, ancient Indian palace courtyard, golden light, wide cinematic landscape`;
    }
    if (primary === "Vyasa") {
      return `Sage Vyasa seated in meditation in a peaceful forest ashram by a river, golden morning light filtering through trees, palm leaf manuscripts nearby, wide landscape`;
    }
    if (primary === "Suta Goswami") {
      return `Suta Goswami speaking to sages seated around a sacred fire in Naimisharanya forest, golden dappled sunlight through ancient trees, wide landscape`;
    }

    const others = secondary ? ` and ${secondary}` : "";
    return `${primary}${others} in a grand ancient Indian palace setting, ornate golden architecture, sacred atmosphere, warm golden light, wide cinematic landscape`;
  }

  // Ultimate fallback — generic but visually rich
  return `A sacred gathering of sages in an ancient Indian forest ashram, golden sunlight filtering through massive banyan trees, a small sacred fire burning, wide cinematic landscape`;
}

/** Build a second scene from tatparya story text */
function buildStoryScene(story: string, characters: string[], contentSnippet: string): string {
  if (/गंगा|नदी.*तट|जल.*दान/u.test(story)) {
    return "Royal family performing sacred water rituals on the banks of the Ganges at sunset, women in white saris offering water, priests chanting, golden light reflecting on the river, wide landscape";
  }
  if (/शंख.*बज|पाञ्चजन्य/u.test(story)) {
    return "Lord Krishna blowing the divine conch Panchajanya with golden light emanating outward, citizens gathered joyfully, magnificent city architecture with golden domes, wide landscape";
  }
  if (/रथ.*पर|रथ.*यात्रा/u.test(story)) {
    const charStr = characters.slice(0, 2).join(" and ") || "royal warriors";
    return `${charStr} riding golden chariots with white horses through an ancient Indian city, cheering crowds, grand temple architecture, golden hour light, wide landscape`;
  }
  if (/शोक|विलाप|रोना|दुख/u.test(story)) {
    return "A solemn gathering of the royal family in a grand palace hall, soft lamplight casting long shadows, Lord Krishna consoling them with a gentle gesture, wide cinematic composition";
  }
  if (/वन.*गमन|वन.*प्रस्थान|गृह.*त्याग/u.test(story)) {
    return "An elderly couple in simple white clothes departing a grand palace at dawn, walking toward a distant forest path, golden morning mist, wide landscape";
  }
  if (/राज्य.*अभिषेक|सिंहासन|राजा.*बन/u.test(story)) {
    return "Grand coronation of a young king in an ancient Indian palace, seated on a golden throne, priests performing Vedic fire rituals, courtiers gathered, wide cinematic composition";
  }
  if (/युद्ध|संग्राम|सेना/u.test(story)) {
    return "Vast ancient Indian battlefield at dawn, golden chariots and warriors assembling, dramatic sky with golden light breaking through clouds, eagles circling, wide panoramic landscape";
  }
  if (/तीर्थ|यात्रा|पवित्र/u.test(story)) {
    return "A sage walking along a sacred river path through rolling hills at sunrise, ancient temples visible in the distance, birds in flight, peaceful wide landscape";
  }
  if (/उपदेश|ज्ञान|शिक्षा/u.test(story)) {
    return "A wise sage teaching younger disciples under a massive banyan tree, sacred texts spread on the ground, golden afternoon light, forest ashram setting, wide landscape";
  }
  if (/भक्ति|प्रेम|पूजा/u.test(story)) {
    return "Devotees performing aarti with golden oil lamps before a magnificent temple at dusk, flower garlands and incense smoke, sacred atmosphere, wide cinematic landscape";
  }

  // Character-aware fallback
  const charStr = characters.slice(0, 2).join(" and ") || "sages";
  return `${charStr} in a peaceful forest ashram by a flowing river, golden sunlight through trees, sacred fire nearby, wide cinematic landscape`;
}

async function detectScenes(chapterTitle: string, contentSnippet: string, maxScenes: number = 3, chapterNumber?: number): Promise<string[]> {
  // COST: Check manifest for cached prompt from a prior generation — if the chapter
  // was processed before, reuse its scene prompt + Hindi description instead of
  // spending another Claude call.
  if (chapterNumber !== undefined) {
    try {
      const manifest = readManifest();
      const existing = manifest.images
        .filter((img) => img.chapterNumber === chapterNumber && img.prompt)
        .sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0));
      if (existing.length > 0) {
        (detectScenes as any)._lastDescriptions = existing.map((e) => e.descriptionHi || "");
        logger.info({ chapterNumber, cachedScenes: existing.length }, "Scene prompt cache HIT — skipping Claude");
        return existing.map((e) => e.prompt!).slice(0, maxScenes);
      }
    } catch { /* cache miss — fall through */ }
  }

  // FIRST: try AI-powered scene generation for rich, detailed prompts
  const aiScene = await buildAIScenePrompt(chapterTitle, contentSnippet);
  if (aiScene) {
    (detectScenes as any)._lastDescriptions = [aiScene.descriptionHi];
    return [aiScene.scene].slice(0, maxScenes);
  }

  // SECOND: try content-aware extraction from the actual chapter text (rule-based)
  const contentScenes = buildContentAwareScene(chapterTitle, contentSnippet);
  if (contentScenes.length > 0) {
    (detectScenes as any)._lastDescriptions = contentScenes.map((s) => s.descriptionHi);
    return contentScenes.map((s) => s.scene).slice(0, maxScenes);
  }

  // THIRD: try keyword-based scene matching
  const combined = `${chapterTitle} ${contentSnippet}`;
  for (const { pattern, scenes } of SCENE_KEYWORDS) {
    if (pattern.test(combined)) {
      (detectScenes as any)._lastDescriptions = undefined;
      return scenes.slice(0, maxScenes);
    }
  }

  // Fallback: pick a generic scene
  (detectScenes as any)._lastDescriptions = undefined;
  const numMatch = chapterTitle.match(/\d+/);
  const idx = numMatch ? parseInt(numMatch[0], 10) % GENERIC_SCENES.length : 0;
  return [GENERIC_SCENES[idx]];
}

function buildPrompt(scene: string, _contentContext: string): string {
  // Inject character persona for consistency, but no art style — let the model decide
  return injectPersona(scene);
}

// ── Together AI image generation (FLUX.2-pro) ─────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function generateWithTogether(prompt: string, destPath: string, model: string = "black-forest-labs/FLUX.2-pro"): Promise<void> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) throw new Error("TOGETHER_API_KEY not set");

  // Style suffix — concise to leave maximum room for the scene description.
  // Scene accuracy is the #1 priority; style can be shorter.
  const styleSuffix = "\nRaja Ravi Varma style classic oil painting, soft painterly brushstrokes, NOT photorealistic. Warm golden sunlight, vibrant sky. Traditional Indian devotional art, serene atmosphere, museum quality fine art. CRITICAL: absolutely NO text NO letters NO words NO writing NO captions NO watermarks NO signatures anywhere in the image — pure artwork only. Ancient Vedic era 5000 years ago — absolutely NO modern items NO modern hairstyles NO trimmed beards NO glasses NO modern clothing. CRITICAL EYE RULE: All characters MUST have normal natural properly aligned eyes — NO crossed eyes NO squinting NO lazy eye NO misaligned pupils. ABSOLUTE GENDER RULES (NEVER VIOLATE): 1) WOMEN: Every single female character MUST have a completely smooth clean-shaven feminine face — absolutely ZERO facial hair, ZERO beard, ZERO mustache, ZERO stubble, ZERO shadow on chin or jaw. Women have soft round cheeks, delicate jawline, kajal-lined eyes, long braided black hair decorated with flowers and gold ornaments. 2) MEN: Every male character MUST have a clearly masculine face with strong angular jawline and broad shoulders. Men must NEVER have flowers in their hair — men wear topknots, crowns, turbans, or matted jata locks ONLY. Only Lord Krishna may wear a single peacock feather. 3) Make male and female characters visually DISTINCT — different body builds, different facial structures, different hair styles. Ancient ashram and forest settings only.";

  // If a regeneration reason is set on globalThis (by regenerateChapterImages),
  // append it to the style suffix as a strong corrective instruction. The
  // previous image had this issue — the new image MUST avoid it.
  let correctiveInstruction = "";
  const regenCtx = (globalThis as any).__nextRegenReason as { reason?: string } | undefined;
  if (regenCtx?.reason) {
    correctiveInstruction = `\nCRITICAL CORRECTION REQUIRED — the previous image of this scene had this specific problem reported by reviewers: "${regenCtx.reason}". The new image MUST fully resolve this issue. Pay extra attention to fix exactly this problem.`;
  }

  // Build the full prompt: scene first (most important), then style + correction
  let fullPrompt = prompt + styleSuffix + correctiveInstruction;

  // FLUX.2-pro prompt limit ~2000 chars. Log a warning if we're truncating.
  // Always preserve the corrective instruction (it's the whole point of regeneration).
  const PROMPT_LIMIT = 2000;
  if (fullPrompt.length > PROMPT_LIMIT) {
    const reservedTail = styleSuffix.length + correctiveInstruction.length;
    const maxPromptLen = PROMPT_LIMIT - reservedTail;
    logger.warn({ originalLen: fullPrompt.length, truncatedTo: PROMPT_LIMIT, hasCorrection: !!correctiveInstruction }, "Truncating prompt for FLUX");
    fullPrompt = prompt.substring(0, maxPromptLen) + styleSuffix + correctiveInstruction;
  }

  logger.info({ promptLen: fullPrompt.length, sceneLen: prompt.length }, "FLUX prompt composed");
  const body: Record<string, unknown> = {
    model,
    prompt: fullPrompt,
    width: 1440,
    height: 768,
  };

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://api.together.xyz/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Together AI error ${response.status}: ${errText}`);
      }

      const result = await response.json() as {
        data?: Array<{ b64_json?: string; url?: string }>;
      };

      if (result.data?.[0]?.b64_json) {
        const buffer = Buffer.from(result.data[0].b64_json, "base64");
        fs.writeFileSync(destPath, buffer);
      } else if (result.data?.[0]?.url) {
        const imgRes = await fetch(result.data[0].url);
        if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);
        const arrBuf = await imgRes.arrayBuffer();
        fs.writeFileSync(destPath, Buffer.from(arrBuf));
      } else {
        throw new Error("No image data in Together AI response");
      }

      logger.info({ attempt, destPath }, "Together AI image generated successfully");
      return; // Success — exit retry loop
    } catch (err: any) {
      lastError = err;
      logger.warn({ attempt, maxRetries: MAX_RETRIES, err: err?.message }, "Together AI attempt failed");
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  throw lastError || new Error("Together AI failed after all retries");
}


// ── Main generation function ─────────────────────────────────────────────────

/**
 * Generate images for a chapter. Supports multiple images (scenes) per chapter.
 * Uses Together AI (FLUX.2) for image generation.
 * Returns array of generated filenames.
 */
export function generateChapterImages(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
): Promise<string[]> {
  return withManifestLock(() => _generateChapterImages(chapterNumber, chapterTitle, contentSnippet));
}

async function _generateChapterImages(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
): Promise<string[]> {
  ensureImageDir();

  const scenes = await detectScenes(chapterTitle, contentSnippet, 1, chapterNumber);
  const generatedFiles: string[] = [];
  const manifest = readManifest();

  for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
    const suffix = sceneIdx === 0 ? "" : `-${sceneIdx + 1}`;
    const filename = `chapter-${String(chapterNumber).padStart(3, "0")}${suffix}.jpg`;
    const destPath = path.join(IMAGES_DIR, filename);

    // Skip if already exists AND is a valid image (>10KB)
    if (fs.existsSync(destPath)) {
      const stat = fs.statSync(destPath);
      if (stat.size > 10_000) {
        logger.info({ chapterNumber, filename, sceneIdx, size: stat.size }, "Chapter image already exists, skipping");
        generatedFiles.push(filename);
        continue;
      }
      // File is too small — likely an error response; delete and regenerate
      logger.warn({ chapterNumber, filename, size: stat.size }, "Removing broken image file");
      fs.unlinkSync(destPath);
    }

    const prompt = buildPrompt(scenes[sceneIdx], contentSnippet);

    try {
      logger.info({
        chapterNumber, sceneIdx, totalScenes: scenes.length,
        engine: "together-flux2",
      }, "Generating chapter image");

      await generateWithTogether(prompt, destPath);

      // Update manifest — include descriptionHi from content-aware extraction
      const descriptions = (detectScenes as any)._lastDescriptions as string[] | undefined;
      const descHi = descriptions?.[sceneIdx] || undefined;

      manifest.images = manifest.images.filter(
        (img) => !(img.chapterNumber === chapterNumber && (img.sceneIndex ?? 0) === sceneIdx)
      );
      const personas = detectPersonasInScene(scenes[sceneIdx]);
      manifest.images.push({
        chapterNumber,
        chapterTitle,
        cantoNumber: getCantoForGlobalChapter(chapterNumber),
        imagePath: filename,
        prompt: scenes[sceneIdx],  // Store the clean scene description, not the full enriched prompt
        descriptionHi: descHi,
        personasUsed: personas.length > 0 ? personas : undefined,
        personaVersion: personas.length > 0 ? getPersonaGroupVersion(personas) : undefined,
        generatedAt: new Date().toISOString(),
        sceneIndex: sceneIdx,
      });

      generatedFiles.push(filename);
      logger.info({ chapterNumber, filename, sceneIdx }, "Chapter image generated successfully");
    } catch (err) {
      logger.warn({ chapterNumber, sceneIdx, err }, "Failed to generate chapter image");
    }
  }

  // Write manifest once after all scenes
  manifest.images.sort((a, b) => {
    if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber;
    return (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0);
  });
  writeManifest(manifest);

  return generatedFiles;
}

/**
 * Generate one additional scene for a chapter that already has image(s).
 * Uses a different part of the content to get a fresh scene.
 */
export function generateAdditionalScene(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
): Promise<string[]> {
  return withManifestLock(async () => {
    ensureImageDir();
    const manifest = readManifest();
    const existing = manifest.images.filter(img => img.chapterNumber === chapterNumber);
    const nextSceneIdx = existing.length; // 0-based: if 1 image exists, next is index 1

    // Ask Claude for a NEW scene using later content
    const offset = Math.min(500, Math.floor(contentSnippet.length / 2));
    const altContent = contentSnippet.substring(offset) || contentSnippet;
    const scenes = await detectScenes(chapterTitle, altContent, 1);
    if (scenes.length === 0) return [];

    const suffix = nextSceneIdx === 0 ? "" : `-${nextSceneIdx + 1}`;
    const filename = `chapter-${String(chapterNumber).padStart(3, "0")}${suffix}.jpg`;
    const destPath = path.join(IMAGES_DIR, filename);

    // Skip if file already exists
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 10_000) {
      logger.info({ chapterNumber, filename }, "Additional scene already exists");
      return [filename];
    }

    const prompt = buildPrompt(scenes[0], altContent);

    try {
      await generateWithTogether(prompt, destPath);
      if (!fs.existsSync(destPath) || fs.statSync(destPath).size < 10_000) return [];
      logger.info({ chapterNumber, filename, size: fs.statSync(destPath).size }, "Additional scene generated");

      // Update manifest
      const personas = detectPersonasInScene(scenes[0]);
      manifest.images.push({
        chapterNumber,
        sceneIndex: nextSceneIdx,
        imagePath: filename,
        prompt: scenes[0],
        descriptionHi: "",
        chapterTitle,
        personasUsed: personas,
        personaVersion: 1,
        generatedAt: new Date().toISOString(),
      });
      writeManifest(manifest);

      return [filename];
    } catch (err) {
      logger.error({ err, chapterNumber }, "Failed to generate additional scene");
      return [];
    }
  });
}

/**
 * Force-regenerate images for a specific chapter.
 * Deletes existing images and manifest entries, then regenerates with content-aware scenes.
 *
 * `reason` is the user-supplied explanation of what was wrong with the previous
 * image (e.g. "woman has beard", "Krishna shown as adult instead of child").
 * It's converted into a corrective instruction that's appended to the FLUX
 * prompt so the new generation actively avoids the issue.
 */
export function regenerateChapterImages(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
  reason?: string,
): Promise<{ files: string[]; trashIds: string[] }> {
  return withManifestLock(async () => {
    ensureImageDir();

    // Move existing images to trash (for undo) instead of deleting
    const manifest = readManifest();
    const existing = manifest.images.filter((img) => img.chapterNumber === chapterNumber);
    const trashIds: string[] = [];
    for (const img of existing) {
      const tid = trashImage(img, "regenerate");
      trashIds.push(tid);
    }
    // Remove from manifest entirely (also clears the cached scene prompt so
    // detectScenes will call AI fresh with the new reason context)
    manifest.images = manifest.images.filter((img) => img.chapterNumber !== chapterNumber);
    writeManifest(manifest);

    // Stash reason on the runtime so generateWithTogether can append it to the
    // style suffix as an explicit AVOID instruction.
    if (reason && reason.trim()) {
      (globalThis as any).__nextRegenReason = { chapter: chapterNumber, reason: reason.trim() };
    }

    try {
      const files = await _generateChapterImages(chapterNumber, chapterTitle, contentSnippet);
      return { files, trashIds };
    } finally {
      delete (globalThis as any).__nextRegenReason;
    }
  });
}

/**
 * Regenerate a chapter image using a user-provided custom prompt.
 * Trashes the existing image and generates a new one with the custom scene description.
 */
export function regenerateWithCustomPrompt(
  chapterNumber: number,
  chapterTitle: string,
  customPrompt: string,
  sceneIndex: number = 0,
  summaryHi?: string,
): Promise<{ file: string | null; trashId: string | null }> {
  return withManifestLock(async () => {
    ensureImageDir();

    // Trash existing image for this scene
    const manifest = readManifest();
    const existing = manifest.images.find(
      (img) => img.chapterNumber === chapterNumber && (img.sceneIndex ?? 0) === sceneIndex
    );
    let trashId: string | null = null;
    if (existing) {
      trashId = trashImage(existing, "regenerate");
      manifest.images = manifest.images.filter(
        (img) => !(img.chapterNumber === chapterNumber && (img.sceneIndex ?? 0) === sceneIndex)
      );
      writeManifest(manifest);
    }

    // Generate with custom prompt
    const suffix = sceneIndex === 0 ? "" : `-${sceneIndex + 1}`;
    const filename = `chapter-${String(chapterNumber).padStart(3, "0")}${suffix}.jpg`;
    const destPath = path.join(IMAGES_DIR, filename);

    const prompt = buildPrompt(customPrompt, "");

    try {
      await generateWithTogether(prompt, destPath);

      const personas = detectPersonasInScene(customPrompt);
      const updatedManifest = readManifest();
      updatedManifest.images.push({
        chapterNumber,
        chapterTitle,
        imagePath: filename,
        prompt: customPrompt,
        descriptionHi: summaryHi || customPrompt,
        personasUsed: personas.length > 0 ? personas : undefined,
        personaVersion: personas.length > 0 ? getPersonaGroupVersion(personas) : undefined,
        generatedAt: new Date().toISOString(),
        sceneIndex,
      });
      updatedManifest.images.sort((a, b) => {
        if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber;
        return (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0);
      });
      writeManifest(updatedManifest);

      // Stage only — daily commit cron handles commit + push
      try {
        const repoRoot = path.resolve(DATA_DIR, "..", "..");
        execSync("git add data/bhagwatham/", { cwd: repoRoot, stdio: "pipe" });
        logger.info({ chapterNumber }, "Regenerated image staged (daily commit will push)");
      } catch (gitErr) {
        logger.warn({ gitErr }, "Git stage failed after regeneration");
      }

      return { file: filename, trashId };
    } catch (err) {
      logger.warn({ chapterNumber, sceneIndex, err }, "Failed to generate with custom prompt");
      return { file: null, trashId };
    }
  });
}

/**
 * Delete a specific image by chapter number and scene index.
 */
export function deleteChapterImage(chapterNumber: number, sceneIndex: number): { success: boolean; deleted?: string; trashId?: string } {
  const manifest = readManifest();
  const img = manifest.images.find((i) => i.chapterNumber === chapterNumber && (i.sceneIndex ?? 0) === sceneIndex);
  if (!img) return { success: false };

  // Move to trash instead of permanent delete
  const trashId = trashImage(img, "delete");

  manifest.images = manifest.images.filter((i) => !(i.chapterNumber === chapterNumber && (i.sceneIndex ?? 0) === sceneIndex));
  writeManifest(manifest);
  logger.info({ chapterNumber, sceneIndex, file: img.imagePath, trashId }, "Deleted chapter image (moved to trash)");
  return { success: true, deleted: img.imagePath, trashId };
}

// Keep backward-compatible single-image function
export async function generateChapterImage(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
): Promise<string | null> {
  const files = await generateChapterImages(chapterNumber, chapterTitle, contentSnippet);
  return files[0] || null;
}

/**
 * Scan batch text for chapter headings and generate images for new chapters.
 */
// OCR-mangled chapter headings — map to correct chapter numbers
const OCR_CHAPTER_FIXES: Record<string, { num: number; title: string }> = {
  "Chapter 278 अध्याय": { num: 8, title: "अध्याय आठ" },
  "Chapter it": { num: 9, title: "अध्याय नौ" },
  "(शुषा दो": { num: 2, title: "अध्याय दो" },
  "Chapter 3:": { num: 6, title: "अध्याय छह" },
  "(नौ": { num: 9, title: "अध्याय नौ" },
};

// Track the highest global chapter number used across all skandhs
let lastGlobalChapterNum = 0;
let lastPerSkandhNum = 0;

function getNextGlobalChapterNum(perSkandhNum: number): number {
  // If chapter number resets (e.g. goes from 19 back to 1), it's a new skandh
  if (perSkandhNum <= lastPerSkandhNum && lastPerSkandhNum > 1) {
    // New skandh — continue global counter from where we left off
    lastGlobalChapterNum++;
  } else if (lastGlobalChapterNum === 0) {
    // First chapter ever — use the per-skandh number
    lastGlobalChapterNum = perSkandhNum;
  } else {
    lastGlobalChapterNum++;
  }
  lastPerSkandhNum = perSkandhNum;
  return lastGlobalChapterNum;
}

function initGlobalChapterCounter(): void {
  // Find the highest chapter number from existing manifest
  const manifest = readManifest();
  if (manifest.images.length > 0) {
    lastGlobalChapterNum = Math.max(...manifest.images.map(img => img.chapterNumber));
    // Also find the last per-skandh chapter number from last batch
    // by looking at the highest chapter number in manifest
    const lastImg = manifest.images.sort((a, b) => b.chapterNumber - a.chapterNumber)[0];
    lastPerSkandhNum = 0; // will be set on next detection
    logger.info({ lastGlobalChapterNum }, "Initialized global chapter counter from manifest");
  }
}

export async function generateImagesForBatch(
  pages: Array<{ pageNumber: number; text: string }>,
): Promise<void> {
  // Page-range-based skandh detection (matches bhagwatham-utils.ts)
  const SKANDH_RANGES = [
    { s: 1, p: 1 }, { s: 2, p: 874 }, { s: 3, p: 1399 }, { s: 4, p: 2617 },
    { s: 5, p: 3900 }, { s: 6, p: 4540 }, { s: 7, p: 5204 }, { s: 8, p: 5849 },
    { s: 9, p: 6373 }, { s: 10, p: 7080 }, { s: 11, p: 9059 }, { s: 12, p: 9500 },
  ];
  const EXPECTED_PER_CANTO = [19, 10, 33, 31, 26, 19, 15, 24, 24, 90, 31, 13];
  const CHAPTER_HEADING_RE = /^(?:Chapter\s+\S+|अध्याय\s+(?:[\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){0,2}|\d+))\s*$/iu;
  const ocrFixKeys = Object.keys(OCR_CHAPTER_FIXES);

  const hindiNums: Record<string, number> = {
    एक:1,दो:2,तीन:3,चार:4,पाँच:5,पांच:5,छः:6,छह:6,सात:7,आठ:8,नौ:9,दस:10,
    ग्यारह:11,बारह:12,तेरह:13,चौदह:14,पन्द्रह:15,पंद्रह:15,सोलह:16,सत्रह:17,
    अठारह:18,उन्नीस:19,बीस:20,इक्कीस:21,बाईस:22,तेईस:23,चौबीस:24,पच्चीस:25,
    छब्बीस:26,सत्ताईस:27,सताईस:27,अट्ठाईस:28,उनतीस:29,उन्तीस:29,तीस:30,
    इकतीस:31,बत्तीस:32,तैंतीस:33,चौंतीस:34,पैंतीस:35,छत्तीस:36,
    सैंतीस:37,अड़तीस:38,उनतालीस:39,चालीस:40,इकतालीस:41,बयालीस:42,तैंतालीस:43,
    चवालीस:44,पैंतालीस:45,छियालीस:46,छियालिस:46,सैंतालीस:47,अड़तालीस:48,
    उनचास:49,पचास:50,इक्यावन:51,बावन:52,तिरपन:53,चौवन:54,पचपन:55,छप्पन:56,
    सत्तावन:57,अट्ठावन:58,उनसठ:59,साठ:60,इकसठ:61,बासठ:62,तिरसठ:63,चौंसठ:64,
    पैंसठ:65,छियासठ:66,सतसठ:67,सड़सठ:67,अड़सठ:68,उनहत्तर:69,सत्तर:70,
    इकहत्तर:71,बहत्तर:72,तिहत्तर:73,चौहत्तर:74,पचहत्तर:75,छिहत्तर:76,सतहत्तर:77,
    अठहत्तर:78,उन्यासी:79,उनासी:79,अस्सी:80,इक्यासी:81,बयासी:82,तिरासी:83,
    चौरासी:84,पिचासी:85,पचासी:85,छियासी:86,सत्तासी:87,अट्ठासी:88,नवासी:89,नब्बे:90,
    तेइस:23,छियलीस:46,पचीस:25,सत्ताइस:27,
  };

  function getSkandhForPage(pageNum: number): number {
    for (let i = SKANDH_RANGES.length - 1; i >= 0; i--) {
      if (pageNum >= SKANDH_RANGES[i].p) return SKANDH_RANGES[i].s;
    }
    return 1;
  }

  function isHeading(t: string): boolean {
    const cleaned = t.replace(/^\d+\s+/, "");
    if (cleaned.length > 60) return false;
    if (t.includes("पूर्ण हुए") || t.includes("पूर्ण हुआ")) return false;
    if (CHAPTER_HEADING_RE.test(cleaned)) return true;
    for (const key of ocrFixKeys) {
      if (cleaned.includes(key) || t.includes(key)) return true;
    }
    return false;
  }

  function extractNum(line: string): number {
    for (const [key, fix] of Object.entries(OCR_CHAPTER_FIXES)) {
      if (line.includes(key)) return fix.num;
    }
    const after = line.replace(/^(?:अध्याय|Chapter)\s*/iu, "").trim();
    if (after && hindiNums[after] !== undefined) return hindiNums[after];
    for (const [w, n] of Object.entries(hindiNums)) {
      if (line.includes(w)) return n;
    }
    const m = line.match(/\d+/);
    if (m) { const n = parseInt(m[0]); if (n > 0 && n <= 500) return n; }
    return 0;
  }

  for (const page of pages) {
    if (!page.text || page.text.length < 20) continue;
    const skandh = getSkandhForPage(page.pageNumber);
    const lines = page.text.split("\n");

    // ToC detection: skip pages with 2+ chapter heading lines
    const headingCount = lines.filter(l => isHeading(l.trim())).length;
    if (headingCount >= 2) {
      logger.info({ pageNumber: page.pageNumber, headingCount }, "Skipping ToC page (multiple chapter headings)");
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!isHeading(trimmed)) continue;
      const chapterNum = extractNum(trimmed);
      if (chapterNum <= 0) continue;

      // Compute global chapter number using skandh page ranges
      let offset = 0;
      for (let s = 0; s < skandh - 1; s++) offset += EXPECTED_PER_CANTO[s];
      const globalNum = offset + chapterNum;

      const chapterTitle = trimmed.substring(0, 60);
      logger.info({ perSkandhNum: chapterNum, skandh, globalNum, chapterTitle }, "Detected chapter for image generation");

      // Get LARGE content snippet — more context = better prompts
      const remainingLines = lines.slice(i + 1, i + 40).join("\n");
      const contentSnippet = remainingLines.substring(0, 2000);

      await generateChapterImages(globalNum, chapterTitle, contentSnippet);
    }
  }
}

/** Return all character personas with their face images for the gallery page */
export function getPersonaGallery(): Array<{
  key: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  faceImage: string | null;
}> {
  let faceManifest: Array<{ characterName: string; imagePath: string }> = [];
  try {
    if (fs.existsSync(FACE_MANIFEST)) {
      faceManifest = JSON.parse(fs.readFileSync(FACE_MANIFEST, "utf-8"));
    }
  } catch { /* ignore */ }

  return Object.entries(CHARACTER_PERSONAS).map(([key, fullDesc]) => {
    const shortDesc = PERSONA_SHORT[key] || "";
    // Extract a readable name from the short description (before the colon)
    const name = shortDesc.split(":")[0]?.trim() || key.replace(/_/g, " ");
    const face = faceManifest.find(f => f.characterName === key);
    return {
      key,
      name,
      shortDescription: shortDesc.split(":").slice(1).join(":").trim(),
      fullDescription: fullDesc,
      faceImage: face ? face.imagePath : null,
    };
  });
}

export function getImagesDir(): string {
  ensureImageDir();
  return IMAGES_DIR;
}

/**
 * Backfill missing chapter images by scanning all pages, building a complete
 * chapter→globalNumber mapping from scratch, and generating images for any
 * chapters that don't yet have images in the manifest.
 */
export async function backfillMissingImages(
  allPages: Array<{ pageNumber: number; text: string }>,
): Promise<{ generated: number; skipped: number; errors: number }> {
  const chapterPattern = /^(?:\d+\s+)?(?:Chapter|अध्याय)\s+(.+)/imu;
  // Also detect OCR-mangled headings that don't match the main pattern
  const ocrFixKeys = Object.keys(OCR_CHAPTER_FIXES);
  const hindiNums: Record<string, number> = {
    एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छः: 6, छह: 6,
    सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12,
    तेरह: 13, चौदह: 14, पन्द्रह: 15, पंद्रह: 15, सोलह: 16, सत्रह: 17,
    अठारह: 18, उन्नीस: 19, बीस: 20, इक्कीस: 21, बाईस: 22,
    तेईस: 23, चौबीस: 24, पच्चीस: 25, छब्बीस: 26, सत्ताईस: 27, सताईस: 27,
    अट्ठाईस: 28, उनतीस: 29, उन्तीस: 29, तीस: 30, इकतीस: 31,
    बत्तीस: 32, तैंतीस: 33, चौंतीस: 34, पैंतीस: 35, छत्तीस: 36,
    सैंतीस: 37, अड़तीस: 38, उनतालीस: 39, चालीस: 40, इकतालीस: 41,
    बयालीस: 42, तैंतालीस: 43, चवालीस: 44, पैंतालीस: 45, छियालीस: 46, छियालिस: 46,
    सैंतालीस: 47, अड़तालीस: 48, उनचास: 49, पचास: 50, इक्यावन: 51,
    बावन: 52, तिरपन: 53, चौवन: 54, पचपन: 55, छप्पन: 56,
    सत्तावन: 57, अट्ठावन: 58, उनसठ: 59, साठ: 60, इकसठ: 61,
    बासठ: 62, तिरसठ: 63, चौंसठ: 64, पैंसठ: 65, छियासठ: 66,
    सतसठ: 67, सड़सठ: 67, अड़सठ: 68, उनहत्तर: 69, सत्तर: 70, इकहत्तर: 71,
    बहत्तर: 72, तिहत्तर: 73, चौहत्तर: 74, पचहत्तर: 75, छिहत्तर: 76,
    सतहत्तर: 77, अठहत्तर: 78, उन्यासी: 79, उनासी: 79, अस्सी: 80, इक्यासी: 81,
    बयासी: 82, तिरासी: 83, चौरासी: 84, पिचासी: 85, पचासी: 85, छियासी: 86,
    सत्तासी: 87, अट्ठासी: 88, नवासी: 89, नब्बे: 90,
    इक्यानवे: 91, इक्यानबे: 91, बानवे: 92, बानबे: 92,
    तिरानवे: 93, तिरानबे: 93, चौरानवे: 94, चौरानबे: 94,
    पचानवे: 95, पचानबे: 95, छियानवे: 96, छियानबे: 96,
    सत्तानवे: 97, सत्तानबे: 97, अट्ठानवे: 98, अट्ठानबे: 98,
    निन्यानवे: 99, निन्यानबे: 99, सौ: 100,
  };

  // Page-range-based skandh detection (matches bhagwatham-utils.ts)
  const SKANDH_RANGES = [
    { s: 1, p: 1 }, { s: 2, p: 874 }, { s: 3, p: 1399 }, { s: 4, p: 2617 },
    { s: 5, p: 3900 }, { s: 6, p: 4540 }, { s: 7, p: 5204 }, { s: 8, p: 5849 },
    { s: 9, p: 6373 }, { s: 10, p: 7080 }, { s: 11, p: 9059 }, { s: 12, p: 9500 },
  ];
  const EXPECTED_PER_CANTO = [19, 10, 33, 31, 26, 19, 15, 24, 24, 90, 31, 13];
  const CHAPTER_HEADING_RE = /^(?:Chapter\s+\S+|अध्याय\s+(?:[\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){0,2}|\d+))\s*$/iu;

  function getSkandhForPage(pageNum: number): number {
    for (let i = SKANDH_RANGES.length - 1; i >= 0; i--) {
      if (pageNum >= SKANDH_RANGES[i].p) return SKANDH_RANGES[i].s;
    }
    return 1;
  }

  function isHeading(t: string): boolean {
    const cleaned = t.replace(/^\d+\s+/, "");
    if (cleaned.length > 60) return false;
    if (t.includes("पूर्ण हुए") || t.includes("पूर्ण हुआ")) return false;
    if (CHAPTER_HEADING_RE.test(cleaned)) return true;
    for (const key of ocrFixKeys) {
      if (cleaned.includes(key) || t.includes(key)) return true;
    }
    return false;
  }

  function extractNum(line: string): number {
    for (const [key, fix] of Object.entries(OCR_CHAPTER_FIXES)) {
      if (line.includes(key)) return fix.num;
    }
    const after = line.replace(/^(?:अध्याय|Chapter)\s*/iu, "").trim();
    if (after && hindiNums[after] !== undefined) return hindiNums[after];
    for (const [w, n] of Object.entries(hindiNums)) {
      if (line.includes(w)) return n;
    }
    const m = line.match(/\d+/);
    if (m) { const n = parseInt(m[0]); if (n > 0 && n <= 500) return n; }
    return 0;
  }

  // Phase 1: Scan all pages to build complete chapter list with global numbers
  interface ChapterInfo {
    globalNumber: number;
    perSkandhNum: number;
    skandh: number;
    title: string;
    contentSnippet: string;
  }
  const chapters: ChapterInfo[] = [];
  const lastChapterPerSkandh = new Map<number, number>();

  // We need page numbers — add a pageNumber tracking wrapper
  // allPages must have pageNumber (it comes from batch data)
  const pagesWithNum = allPages as Array<{ pageNumber: number; text: string }>;

  for (const page of pagesWithNum) {
    if (!page.text || page.text.length < 20) continue;
    const skandh = getSkandhForPage(page.pageNumber);
    const lines = page.text.split("\n");
    const headingCount = lines.filter(l => isHeading(l.trim())).length;
    if (headingCount >= 2) continue;

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!isHeading(t)) continue;
      const num = extractNum(t);
      if (num <= 0) continue;

      const lastNum = lastChapterPerSkandh.get(skandh) ?? 0;
      if (num < lastNum && lastNum > 2) continue;
      if (chapters.find(c => c.perSkandhNum === num && c.skandh === skandh)) continue;

      lastChapterPerSkandh.set(skandh, num);
      const contentSnippet = lines.slice(i + 1, i + 40).join("\n").substring(0, 2000);
      chapters.push({
        globalNumber: 0, // computed after sorting
        perSkandhNum: num,
        skandh,
        title: t.substring(0, 60),
        contentSnippet,
      });
    }
  }

  chapters.sort((a, b) => a.skandh !== b.skandh ? a.skandh - b.skandh : a.perSkandhNum - b.perSkandhNum);

  // Assign global chapter numbers
  for (const ch of chapters) {
    let offset = 0;
    for (let i = 0; i < ch.skandh - 1; i++) offset += EXPECTED_PER_CANTO[i];
    ch.globalNumber = offset + ch.perSkandhNum;
  }

  // Phase 2: Find chapters missing from manifest and generate images
  const manifest = readManifest();
  const existingChapters = new Set(manifest.images.map(img => img.chapterNumber));
  const missingChapters = chapters.filter(ch => !existingChapters.has(ch.globalNumber));

  logger.info({
    totalChapters: chapters.length,
    existingImages: existingChapters.size,
    missingCount: missingChapters.length,
    missingGlobalNums: missingChapters.map(c => c.globalNumber),
  }, "Backfill: scanning for missing chapter images");

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const ch of missingChapters) {
    try {
      logger.info({ globalNumber: ch.globalNumber, skandh: ch.skandh, perSkandhNum: ch.perSkandhNum, title: ch.title }, "Backfill: generating image");
      const files = await generateChapterImages(ch.globalNumber, ch.title, ch.contentSnippet);
      if (files.length > 0) {
        generated++;
      } else {
        skipped++;
      }
    } catch (err) {
      logger.warn({ globalNumber: ch.globalNumber, err }, "Backfill: failed to generate image");
      errors++;
    }
  }

  // Update global counter to match the highest chapter we now have
  if (chapters.length > 0) {
    lastGlobalChapterNum = Math.max(...chapters.map(c => c.globalNumber));
    lastPerSkandhNum = chapters[chapters.length - 1].perSkandhNum;
  }

  return { generated, skipped, errors };
}

// ── Canto number lookup for chapter images ─────────────────────────────────

const CANTO_EXPECTED = [19, 10, 33, 31, 26, 19, 15, 24, 24, 90, 31, 13];

/** Map a global chapter number → canto (skandh) 1-12 */
export function getCantoForGlobalChapter(globalChapter: number): number {
  let offset = 0;
  for (let i = 0; i < CANTO_EXPECTED.length; i++) {
    if (globalChapter <= offset + CANTO_EXPECTED[i]) return i + 1;
    offset += CANTO_EXPECTED[i];
  }
  return 12;
}

/** Backfill cantoNumber for all manifest images missing it */
export function backfillManifestCantoNumbers(): number {
  const manifest = readManifest();
  let fixed = 0;
  for (const img of manifest.images) {
    if (!img.cantoNumber || img.cantoNumber === 0) {
      img.cantoNumber = getCantoForGlobalChapter(img.chapterNumber);
      fixed++;
    }
  }
  if (fixed > 0) {
    writeManifest(manifest);
    logger.info({ fixed }, "Backfilled cantoNumber for manifest images");
  }
  return fixed;
}
