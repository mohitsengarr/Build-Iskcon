// Real scenes from public.bhagavatam_chapter_scenes (read-only SELECT on
// 2026-09-13), as the text the functions match canon against:
// title. setting. summary. image_prompt. characters.
//
// `before` = seeded canon row ids that fired with the ORIGINAL seed (no context
// or negative_triggers columns); `after` = ids that fire with the current seed.
// Same numbers as the SQL sweep over all 1559 Bhagavatam + 264 Chaitanya scenes:
// rows 1/3/4 fired on 8 scenes and row 2 on 10 before; rows 1-4 fire on g7 s3
// only after.
import type { CanonRow } from "../../supabase/functions/_shared/sceneResearchCore.ts";

export interface MeasuredScene {
  key: string;
  why: string;
  before: number[];
  after: number[];
  text: string;
}

const SOURCE = "editor: Bhagavad-gita iconography (migrated from generate-gita-chapter-art)";
const OLD_NEGATIVES = [
  "!rathayatra", "!jagannatha", "!surya", "!garuda", "!dvaraka", "!daruka", "!kartavirya", "!sahasrarjuna", "!sahasrabahu",
];

/** The seed as it was before this fix: positive groups and inline negatives only. */
export const ORIGINAL_SEED: CanonRow[] = [
  { id: 1, subject: "Arjuna's chariot", attribute: "horses", prompt_text: "Arjuna's chariot is drawn by exactly four white horses, no more and no fewer", triggers: ["arjuna+chariot", "partha+chariot", ...OLD_NEGATIVES], book: null, source: SOURCE },
  { id: 2, subject: "Arjuna's chariot", attribute: "banner", prompt_text: "a banner bearing Hanuman flies above Arjuna's chariot", triggers: ["arjuna+chariot", "arjuna+banner", "arjuna+flag", "partha+chariot", ...OLD_NEGATIVES], book: null, source: SOURCE },
  { id: 3, subject: "Arjuna's chariot", attribute: "charioteer", prompt_text: "Krishna stands at the front of the chariot holding the reins as charioteer", triggers: ["arjuna+chariot", "arjuna+rein", "partha+chariot", ...OLD_NEGATIVES], book: null, source: SOURCE },
  { id: 4, subject: "Arjuna", attribute: "position and bow", prompt_text: "Arjuna stands behind Krishna in the chariot holding the Gandiva bow", triggers: ["arjuna+chariot", "partha+chariot", "gandiva+chariot", ...OLD_NEGATIVES], book: null, source: SOURCE },
  { id: 5, subject: "Krishna", attribute: "appearance", prompt_text: "Krishna has blue skin, a peacock feather in his crown and yellow silk pitambara", triggers: ["krishna+arjuna", "krishna+kurukshetra", "krishna+chariot", "krishna+gandiva", "!rathayatra", "!jagannatha", "!chaitanya", "!mahaprabhu"], book: null, source: SOURCE },
];

export const MEASURED_SCENES: MeasuredScene[] = [
  {
    key: "bhagavatam:g7:s3",
    why: "Arjuna's chariot with Krishna driving: the canon is right here",
    before: [1, 2, 3, 4, 5],
    after: [1, 2, 3, 4, 5],
    text: `Arjuna Pursues Ashvatthama to Avenge Draupadi's Sons. Battlefield aftermath near Hastinavpur, transitioning to pursuit across the land. After learning that Ashvatthama murdered the five sleeping sons of Draupadi, Arjuna vows to cut off Ashvatthama's head with arrows from his Gandiva bow and present it to the grieving mother. Arjuna, guided by Lord Krishna as his charioteer, dons his armor and sets out in pursuit on his chariot bearing the hanuman banner.. A wide establishing shot showing Draupadi, a FEMALE young woman aged 25-28 with dark olive-brown complexion, large fierce expressive lotus-petal dark eyes lined with kajal, long thick dark black wavy hair with jasmine flowers, wearing red and gold silk sari, standing with tears streaming down her face as she looks at the bodies of her five slain sons. Behind her, Arjuna, a tall muscular MALE warrior aged 30-35 with fair wheat complexion, sharp angular handsome face, determined intense dark brown eyes, long dark black hair tied in warrior topknot with golden diadem across forehead, donning gleaming golden chest armor with silver arm-guards, grips his mighty Gandiva bow. To his side sits Lord Krishna, a MALE divine being aged 20-25 with luminous deep blue skin, serene face with large lotus-shaped dark brown eyes, wearing yellow silk pitambara and golden crown with peacock feather, seated on the divine chariot. The chariot bears the hanuman banner. Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.. Arjuna, Draupadi, Krishna`,
  },
  {
    key: "bhagavatam:g10:s0",
    why: "Krishna's departure from Hastinapura: no Kurukshetra chariot",
    before: [1, 2, 3, 4, 5],
    after: [5],
    text: `Krishna's Departure from Hastinapura. The grand entrance courtyard of Hastinapura palace, with royal gates and chariots prepared. Lord Krishna, after consoling the Pandavas and spending months in Hastinapura, prepares to depart for Dwarka. Yudhishthira grants him permission with deep reverence, prostrating before him despite knowing Krishna's divine nature. Krishna embraces the king as a younger brother would honor an elder.. A medium-close group composition of Lord Krishna—a luminous deep blue-skinned divine MALE youth aged 25, with lotus eyes, peacock feather in black curly hair, wearing radiant yellow silk pitambara dhoti and Vaijayanti garland—standing before King Yudhishthira, a fair-complexioned noble MALE king with gentle sorrowful eyes and white royal garments. Krishna bows with joined palms at Yudhishthira's feet in respectful farewell while the king places a hand on his shoulder. Muscular warrior princes Bhima and Arjuna stand behind, their faces showing restrained emotion. A chariot with white horses waits beyond marble pillars. Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.. Krishna (Adult Male), Yudhishthira (Male), Bhima (Male), Arjuna (Male)`,
  },
  {
    key: "bhagavatam:g10:s2",
    why: "Arjuna holds a parasol over Krishna's chariot: Arjuna is not in a chariot of his own",
    before: [1, 2, 3, 4, 5],
    after: [5],
    text: `Arjuna Holds the Royal Parasol. The royal departure road from Hastinapura palace, lined with musicians and well-wishers. As Krishna departs, his dear friend Arjuna, the greatest warrior of the age, takes the jeweled parasol over him as a mark of honor and protection. Uddhava and Satyaki fan Krishna with ornamental fans as the divine procession moves forward.. A medium-close group composition of Lord Krishna seated in a ornate white chariot, his luminous deep blue skin radiating against the yellow silk pitambara dhoti, peacock feather crown gleaming. Tall, muscular MALE warrior Arjuna with fair complexion, sharp handsome features and dark topknot holds aloft a magnificent white parasol decorated with pearl fringes and golden staff above Krishna's head. To Krishna's sides, young devotee Uddhava—a fair MALE youth with gentle features and simple yellow dhoti—and warrior Satyaki wave ornate peacock feather fans with graceful movements. The chariot moves forward on a marble road lined with conch-shell sound and flower blossoms. Royal guards and musicians accompany behind. Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.. Krishna (Adult Male), Arjuna (Male), Uddhava (Male), Satyaki (Male)`,
  },
  {
    key: "bhagavatam:g15:s2",
    why: "Khandava forest memory: Krishna is not driving",
    before: [1, 2, 3, 4, 5],
    after: [5],
    text: `Arjuna's Memory of the Khandava Forest Victory. Khandava Forest burning, celestial realm nearby. Arjuna recalls how, with Krishna's support, he protected the great Indra's sacred Khandava Forest from being burned by Agni (the fire god), rescued the demon Maya from destruction, and enabled the construction of the magnificent illusory palace for Yudhishthira's royal assembly.. A wide establishing shot of the Khandava Forest ablaze with towering golden and orange flames consuming ancient trees, while Arjuna (MALE, fair-complexioned warrior aged 30-35, muscular build in golden armor, holding Gandiva bow) stands in the center drawing his bowstring with determined focus, his figure backlit by the inferno. Golden celestial figures representing Agni (the radiant fire deity with orange-red luminous body) hover above the flames. The demon Maya (dark-complexioned figure with humanoid form) cowers beneath fallen timber seeking refuge. In the mystical distance above, a ghostly translucent form of Krishna (MALE, blue-dark complexion, peaceful expression) appears in ethereal light, guiding Arjuna's actions. Indra's celestial chariot is visible in the upper sky. The palace structure that will emerge from this destruction is suggested by luminous architectural outlines. Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.. Arjuna, Agni (fire god), Maya (demon architect), Krishna (remembered)`,
  },
  {
    key: "bhagavatam:g189:s3",
    why: "Abhimanyu, 'son of Arjuna', fights Brihadbal: neither Arjuna nor Krishna is present",
    before: [1, 2, 3, 4],
    after: [],
    text: `Abhimanyu Slays King Brihadbal in Battle. Battlefield during Mahabharata war, surrounded by chariots and soldiers. The genealogy mentions King Brihadbal, an illustrious Solar Dynasty ruler, whose death in battle is noted. Shukadeva recounts that Brihadbal fell in combat at the hands of Abhimanyu, son of Arjuna, establishing a poignant historical connection to the Mahabharata events.. A wide establishing shot of a chaotic battlefield with dust clouds and fallen warriors. In the center, King Brihadbal, a noble warrior king aged 50-55 with fair complexion and royal armor, stands on his war chariot raising his sword in final defiance. Before him, the youthful warrior Abhimanyu, aged 20-25 with chiseled face, fair complexion, and gleaming golden armor with celestial markings, draws his divine sword with intense focused dark eyes, his bow and quiver visible on his back. Between them swirls dust and smoke from the raging battle. Other soldiers and chariots clash in the background. Brihadbal's royal flag waves above his chariot. The sky is darkened by arrows and battle haze. Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.. Brihadbal, Abhimanyu`,
  },
  {
    key: "bhagavatam:g272:s2",
    why: "welcome at the Indraprastha gates: the flags are the city's",
    before: [2, 5],
    after: [5],
    text: `King Yudhishthira's Ecstatic Welcome at Indraprastha Gates. The gates of Indraprastha city, with decorated pathways and welcoming crowds. When Krishna arrives at Indraprastha, King Yudhishthira rushes out beyond the city gates in overwhelming joy. He embraces Krishna repeatedly, tears streaming down his face as his heart dissolves in devotion. The Pandava brothers—Bhima, Arjuna, and the twins Nakul and Sahadeva—follow, each greeting Krishna with profound affection and reverence.. A medium-close group composition of King Yudhishthira (MALE, fair-complexioned, gentle eyes glistening with tears, white royal garments, simple golden crown) embracing Lord Krishna (MALE, luminous deep blue skin, yellow silk pitambara, radiant face) with profound emotion. Bhima (MALE, muscular, powerful build, weathered complexion, tears streaming, embracing Krishna from the side) laughs and weeps simultaneously. Arjuna (MALE, fair wheatish complexion, diadem crown, intense focused eyes, golden armor) awaits his turn with folded hands. The twins Nakul and Sahadeva (MALE, fair complexion, youthful features, kneeling) bow respectfully. Musicians play conches and drums in the background. City gates decorated with colorful flags, flowers, and golden toranas frame the sacred reunion. The light is warm amber-gold suggesting late afternoon. Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.. Lord Krishna, King Yudhishthira, Bhima, Arjuna, Nakul, Sahadeva`,
  },
  {
    key: "bhagavatam:g276:s1",
    why: "Yudhishthira's Rajasuya procession: the chariot is Yudhishthira's",
    before: [1, 2, 3, 4, 5],
    after: [5],
    text: `Yudhishthira's Splendid Post-Sacrifice Procession to the Yamuna. The processional route from Indraprastha to the banks of the Yamuna River, with assembled armies of Yadu, Srinjai, Kamboja, Kuru, Kekaya, and Kosala kingdoms forming the retinue. After the successful completion of the Rajasüya sacrifice, King Yudhishthira leads a grand procession to the Yamuna River for the final ritual bathing (avabhrita). The king rides in a golden chariot drawn by magnificent horses, accompanied by all the assembled kings, rishis, devas, and court attendants adorned with flowers, sandalwood paste, and jewels. Musicians play divine instruments while citizens and royal women celebrate.. A wide establishing shot of King Yudhishthira (fair-complexioned noble MALE aged 35-40, white royal garments, gentle features) seated upon a golden chariot drawn by magnificent white horses adorned with golden trappings, moving forward along a grand processional path toward the Yamuna River visible in the distance. Beside him stands Queen Draupadi (dark olive-brown FEMALE, aged 25-28, red and gold silk sari, draped ornaments) holding offerings. The entire procession stretches behind: rows of mounted warriors on royal elephants, chariots flying colorful flags and banners in reds and golds, foot soldiers bearing ceremonial weapons. Musicians play mridanga drums, conch shells, and veenas creating celestial music. Clouds of flower petals fall from above while devas and rishis hover in the sky applauding. The Yamuna's sacred waters shimmer golden in the near distance. Sky transitions from warm saffron to deeper gold. Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.. Yudhishthira, Draupadi, Arjuna, Bhima, Krishna`,
  },
  {
    key: "bhagavatam:g278:s1",
    why: "Krishna's own chariot against Shalva, driven by Daruka",
    before: [5],
    after: [5],
    text: `Shalva's Javelin Shattered into Hundred Pieces. Mid-air above Dwarka's battlefield, with storm clouds and celestial light. Shalva, enraged at seeing Krishna arrive, hurls his terrifying thundering javelin directly at Krishna's charioteer. Krishna instantly obliterates the weapon with a hundred precise arrow volleys, its fragments scattering across the sky like a meteor exploding into fragments.. A medium-close action composition showing Lord Krishna (MALE, luminous deep blue skin, oval face, large lotus eyes, curly black shoulder-length hair with peacock feather, yellow silk dhoti, broad muscular chest, holding his divine Gandiva bow with arrow drawn) releasing a volley of luminous arrows skyward. Before him, a massive terrifying javelin (Shakti) spirals through dark stormy clouds, trailing smoke and thunder-light. The weapon shatters explosively into hundreds of glowing fragments mid-air like a meteor burst. Shalva (MALE, dusky bronze skin, fierce dark eyes, long black hair, dark iron armor with gold trim, seated in the Saubha vimana above) watches in shock. Daruka (MALE, fair complexion, focused expression) controls the chariot below. Divine light and arrow fragments illuminate the turbulent sky. Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.. Krishna, Shalva, Daruka`,
  },
  {
    key: "bhagavatam:g283:s0",
    why: "Krishna and Balarama ride to Kurukshetra for the solar eclipse, not the battle",
    before: [5],
    after: [5],
    text: `The Yadavas' Magnificent Procession to Kurukshetra. Highway to Kurukshetra, sacred pilgrimage route with trees and open fields. The Yadava clans travel en masse to the sacred Kurukshetra pilgrimage site for the solar eclipse, their procession glittering with celestial chariots, mighty elephants, and divine ornaments. Krishna and Balarama lead their kinspeople through the landscape like gods descending from heaven.. A wide establishing shot of the Yadava royal procession approaching Kurukshetra: Krishna (adult male, luminous deep blue skin, golden pitambara dhoti, peacock feather crown, carrying flute) and Balarama (powerful MALE with fair white complexion, blue garments, holding his plough weapon) ride at the center on ornate celestial chariots pulled by prancing horses with golden harnesses. Behind them: Vasudeva (MALE, noble dignified, dark complexion, royal garments) and dozens of beautiful Yadava women in flowing silk saris with gold jewelry, children, warriors in gleaming armor, and elephants trumpeting like clouds. The procession moves across a sacred landscape with distant temple spires, flowering trees, and golden sunlight streaming down. Vaijayanti flower garlands adorn every chariot. Classical Indian devotional oil painting, warm saffron and gold tones, NOT photorealistic.. Krishna (adult male), Balarama (male), Vasudeva (male), Yadu clan members`,
  },
  {
    key: "bhagavatam:g285:s4",
    why: "the Yadavas leave Kurukshetra for Dwarka: no Arjuna, no battle",
    before: [5],
    after: [5],
    text: `Nanda Maharaja's Tearful Departure and the Yadavas' Return to Dwarka. Kurukshetra, as the monsoon season approaches and groups begin to depart. After three months at Kurukshetra, the time comes for visitors to depart. Nanda Maharaja, unable to separate from his beloved relationships, delays his own departure until finally the monsoon season arrives. As the Yadavas return to Dwarka, Vasudeva becomes deeply moved recounting the profound friendship he has witnessed, weeping openly with tears of love and gratitude for their connection.. A wide establishing shot of Kurukshetra at the onset of monsoon season, with dark clouds gathering overhead and scattered groups preparing to depart. Nanda Maharaja, a MALE elderly cowherd chief aged 55-60 with round jolly face, warm tanned complexion, kind smiling dark brown eyes with laugh lines, short grey beard, broad nose, wearing simple white dhoti and uttariya cloth, rudraksha mala around neck, turban on head—stands with lingering reluctance, turning back repeatedly toward the assembled Yadavas and Krishna. Vasudeva, a MALE noble Indian man aged 40-45 with medium-dark complexion, thick dark beard and mustache, determined courageous dark brown eyes, wearing royal but simple garments with gold armlets—sits or stands nearby with tears streaming down his weathered face, one hand pressed to his heart in overwhelming emotion, speaking to others about Nanda's deep friendship. Krishna, a MALE aged 20-25 with luminous deep blue skin, large lotus-like dark brown eyes, curly jet-black hair with peacock feather, yellow silk pitambara dhoti, Kaustubha gem on chest—stands watching with serene compassionate expression. Around them, the Yadavas in their rich silk garments prepare chariots and horses for the journey back to Dwarka. The sky is grey with approaching storm clouds, wind is visible in the rippling of cloth and hair. The entire scene is suffused with an atmosphere of loving-kindness tinged with melancholy. Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.. Nanda Maharaja, Vasudeva, The Yadavas, Krishna`,
  },
  {
    key: "bhagavatam:g287:s1",
    why: "Arjuna drives Subhadra away at Dwarka's Ratha Yatra: Krishna is not his charioteer",
    before: [1, 2, 3, 4, 5],
    after: [],
    text: `The Chariot Abduction During the Festival. Dwarka's temple chariot festival grounds, with towering ratha and crowds of devotees. Subhadra attends the great Ratha Yatra (chariot festival) honoring Vishnu. Seizing his opportunity, Arjuna reveals his true form, takes up his bow, defeats the palace guards attempting to stop him, and carries Subhadra away in his chariot like a lion seizing its prey.. A wide establishing shot of Arjuna, a tall muscular MALE warrior aged 32 with fair complexion wearing golden armor and jeweled diadem crown, standing in his celestial chariot drawn by white horses as he draws his mighty Gandiva bow with arrows. Subhadra, a beautiful young FEMALE woman aged 16-18 with golden complexion, large dark eyes, long braided black hair with flowers, wearing an elegant blue silk sari, sits beside him in astonishment and joy. In the foreground, Yadava warriors with shields and swords raise their weapons in futile resistance. The towering Ratha temple chariot looms in the background with crowds of devotees watching. Balarama's silhouette appears furious in the distance. The sky blazes with festival colors. Classical Indian devotional oil painting, warm saffron and orange tones, NOT photorealistic.. Arjuna, Subhadra, Balarama, Krishna, Yadava warriors`,
  },
  {
    key: "bhagavatam:g290:s3",
    why: "Krishna's own celestial chariot beyond the lokas",
    before: [1, 2, 3, 4, 5],
    after: [5],
    text: `Krishna and Arjuna's Divine Journey Beyond the Lokas. The cosmic boundary between manifest creation and primordial darkness, beyond the material universes. Krishna and Arjuna board Krishna's celestial chariot and journey through the seven islands, seven seas, past the Lokalock mountain, and into the cosmic darkness. Krishna sends forth his blazing Sudarshana chakra to illuminate the void.. A wide establishing shot of Lord Krishna, a MALE divine youth aged 20-25 with luminous deep blue skin, wearing yellow silk pitambara, standing in a magnificent divine chariot pulled by four celestial horses named Shaibi, Sugriva, Meghapushpa, and Balahaka. Arjuna, a MALE warrior with fair complexion and golden armor, stands beside Krishna holding the Gandiva bow. The chariot moves through deep pitch-black cosmic darkness with the blazing Sudarshana chakra floating ahead, glowing like a thousand suns, its radiant light penetrating the impenetrable void. Stars and distant cosmic realms shimmer in the background darkness. Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.. Krishna, Arjuna`,
  },
  {
    key: "bhagavatam:g341:s2",
    why: "Kurukshetra flashback with Krishna's chariot but no Arjuna",
    before: [5],
    after: [5],
    text: `Krishna Recalls Bhishma's Teaching to Yudhishthira. Flashback vision: Kurukshetra battlefield with Krishna's chariot in foreground, Bhishma on bed of arrows in background, assembled warriors and sages. Krishna reminisces how King Yudhishthira, grieving after the Kurukshetra war and its devastation, sought knowledge of dharma and liberation from the great elder Bhishma, who taught the same principles now being revealed to Uddhava.. A wide establishing shot showing a split vision: In foreground, Krishna with luminous blue skin (hex #1a3a6b) and Uddhava (fair-skinned MALE, clean-shaven, wearing yellow dhoti) sit together. In background, a luminous memory vision materializes: the elderly MALE warrior Bhishma Pitamah with fair luminous complexion (hex #d0b890), silver-white flowing beard and hair, lies upon a raised bed of arrows with multiple shafts piercing his body, speaking with wisdom. Before him kneels the noble MALE King Yudhishthira in simple white garments, his gentle face turned upward listening intently. Assembled MALE sages sit silently witnessing on the sacred Kurukshetra field, with chariot wheels and banners visible. Golden divine light connects the two time periods. Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.. Krishna (adult male), Uddhava (male), Bhishma (elder male), Yudhishthira (male)`,
  },
  {
    key: "bhagavatam:g353:s4",
    why: "Arjuna escorts the Yadava survivors AFTER Krishna's departure",
    before: [2, 5],
    after: [5],
    text: `Arjuna Restores Yadava Survivors to Indraprastha. The palace throne room of Indraprastha, with morning sunlight streaming through pillared halls. Arjuna leads the surviving women, children, and elders of the Yadava clan from Dwarka to Indraprastha, the Pandava capital, where he installs Vajra (the young son of Aniruddha) as the new king to preserve the royal lineage.. A wide establishing shot of Indraprastha's grand palace throne room with soaring stone pillars and ornate carvings. Arjuna, a tall muscular MALE warrior aged 30-35 with fair complexion and golden diadem, stands beside a ceremonial throne, his hand placed protectively on the shoulder of Vajra, a young MALE prince aged 8-10 with golden complexion, wearing a small jeweled crown and royal yellow silk dhoti, his face solemn beyond his years. Before them stand a gathered assembly of Yadava FEMALE widows in white saris—Rukmini-like queens with flower-adorned braided hair, and clusters of young FEMALE and MALE children. Elderly Yadava men stand respectfully in the background. Golden morning light floods through tall arched windows. Flags bearing Krishna's chakra symbol hang from the walls. The mood is ceremonial yet heavy with shared grief. Warm saffron and gold devotional tones. Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.. Arjuna, Vajra (young prince), Yadava widows and children`,
  },
];

/**
 * Chapter briefs stored in public.gita_chapter_art_review (the brief part of the
 * prompt, before the style tail). Chapter 3's brief names no Kurukshetra, which
 * is why 'charioteer' is a context trigger. Every Gita brief must keep rows 1-4.
 */
export const GITA_BRIEFS: { chapter: string; text: string }[] = [
  {
    chapter: "Karma-yoga (gita_chapter_art_review id 4)",
    text: "Karma-yoga. Oil painting: MALE Krishna (blue-skinned, peacock feather in crown) sits in the chariot facing MALE Arjuna (muscular warrior, troubled expression). Krishna gestures with raised palm, teaching. The chariot stands on Kurukshetra battlefield, but no combat visible—only rolling fields and morning light. Horses stand peacefully. Distant army tents visible but subdued.. Krishna, Arjuna",
  },
  {
    chapter: "Contents of the Gita Summarized (gita_chapter_art_review id 14)",
    text: "Contents of the Gita Summarized. Devotional oil painting: Krishna, a youthful MALE charioteer with blue skin and peacock feather in his crown, stands at the front of a chariot drawn by exactly four white horses, holding the reins. Behind him, Arjuna, a muscular MALE warrior, stands with the Gandiva bow lowered in despair. The chariot flies a banner bearing Hanuman. Krishna gestures with one hand in teaching pose, his yellow silk pitambara glowing. Kurukshetra stretches as a flat open plain behind them, distant armies visible but not engaged. Dawn light illuminates Krishna's face as he begins his discourse.. Krishna, Arjuna",
  },
];
