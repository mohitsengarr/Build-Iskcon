// The paintings the Krishna wallpaper turns through: approved chapter art from
// the Gita, Bhagavatam and Chaitanya Charitamrita galleries, each looked at
// before it went in. Kept to those where Krishna is the subject and painted as
// He is known — blue, peacock feather, yellow silk. Left out: scenes where He is
// only mentioned, or appears small inside another's vision, and the one Chaitanya
// Charitamrita scene that paints Him golden.
//
// focusX is where His face is across the painting (0 left, 1 right), measured
// off each image, so a tall phone screen crops to Him rather than to the middle
// of the canvas. A wide
// screen crops height instead, and faces sit in the upper part of nearly every
// painting, so the default keeps the top third (focusY 0.3).

const STORE = "https://etfmndcrchundvgtvmot.supabase.co/storage/v1/object/public/";

export interface Wallpaper {
  /** The art-review row it came from, as book + id. */
  id: string;
  src: string;
  focusX: number;
  /** Where the heads sit down the painting, for wide screens that crop height. */
  focusY?: number;
  caption: string;
  source: string;
}

// Interleaved across the three books, so the day does not sit in one of them.
export const KRISHNA_WALLPAPERS: readonly Wallpaper[] = [
  { id: "cc-227", src: `${STORE}chaitanya-art-images/art-adi-ch3-1786956278864.jpg`, focusX: 0.48, caption: "Krishna resolves to descend as Sri Chaitanya", source: "Chaitanya Charitamrita, Adi 3" },
  { id: "gita-21", src: `${STORE}instagram-images/gita-ch1-1789324498696.jpg`, focusX: 0.42, caption: "Krishna drives Arjuna's chariot between the two armies", source: "Bhagavad Gita 1" },
  { id: "sb-53", src: `${STORE}chapter-art-images/art-canto1-ch11-1780827201095.jpg`, focusX: 0.44, caption: "Krishna sounds the Panchajanya conch at Dwarka's gates", source: "Srimad Bhagavatam 1.11" },
  { id: "gita-55", src: `${STORE}instagram-images/gita-ch10-1791141078922.jpg`, focusX: 0.5, caption: "Krishna reveals His opulences", source: "Bhagavad Gita 10" },
  { id: "sb-89", src: `${STORE}chapter-art-images/art-canto3-ch4-1781549403970.jpg`, focusX: 0.48, caption: "Krishna withdraws to the banks of the Saraswati", source: "Srimad Bhagavatam 3.4" },
  { id: "gita-1", src: `${STORE}instagram-images/gita-ch12-1787300728938.jpg`, focusX: 0.42, focusY: 0.4, caption: "Krishna speaks to Arjuna of devotion", source: "Bhagavad Gita 12" },
  { id: "sb-110", src: `${STORE}chapter-art-images/art-canto1-ch8-1782548640928.jpg`, focusX: 0.43, caption: "Krishna raises the Sudarshana chakra against the brahmastra", source: "Srimad Bhagavatam 1.8" },
  { id: "gita-54", src: `${STORE}instagram-images/gita-regen-54-1792098502007.jpg`, focusX: 0.36, caption: "A leaf, a flower, a fruit, offered with love", source: "Bhagavad Gita 9" },
  { id: "cc-334", src: `${STORE}chaitanya-art-images/art-antya-ch15-1789444241719.jpg`, focusX: 0.3, caption: "Mahaprabhu sees Krishna beneath the kadamba tree", source: "Chaitanya Charitamrita, Antya 15" },
  { id: "gita-22", src: `${STORE}instagram-images/gita-ch2-1789354422265.jpg`, focusX: 0.44, caption: "Krishna, charioteer of Arjuna, at Kurukshetra", source: "Bhagavad Gita 2" },
  { id: "sb-97", src: `${STORE}chapter-art-images/art-canto3-ch3-1782159241010.jpg`, focusX: 0.3, caption: "Krishna masters the Vedas in a single hearing", source: "Srimad Bhagavatam 3.3" },
  { id: "gita-53", src: `${STORE}instagram-images/gita-ch4-1790136787108.jpg`, focusX: 0.22, caption: "Krishna passes the eternal knowledge to the sun-god", source: "Bhagavad Gita 4" },
  { id: "sb-7", src: `${STORE}chapter-art-images/art-canto1-ch10-1780644191848.jpg`, focusX: 0.3, caption: "Krishna takes leave of Hastinapura", source: "Srimad Bhagavatam 1.10" },
  { id: "gita-51", src: `${STORE}instagram-images/gita-regen-51-1791141044073.jpg`, focusX: 0.58, caption: "Krishna is the taste of water", source: "Bhagavad Gita 7" },
  { id: "gita-56", src: `${STORE}instagram-images/gita-ch11-1791141105141.jpg`, focusX: 0.45, caption: "Arjuna beholds the universal form", source: "Bhagavad Gita 11" },
  { id: "gita-13", src: `${STORE}instagram-images/gita-regen-13-1789005583038.jpg`, focusX: 0.35, caption: "Krishna teaches at dawn on the field of Kurukshetra", source: "Bhagavad Gita 3" },
  { id: "gita-46", src: `${STORE}instagram-images/gita-ch8-1790136303733.jpg`, focusX: 0.48, caption: "A devotee leaves his body remembering Krishna", source: "Bhagavad Gita 8" },
];
