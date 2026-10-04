import { describe, expect, it } from "vitest";
import {
  API_USER_AGENT, CARD_GAP_PX, CARD_MARGIN_PX, MAX_DEFINITIONS, MAX_SENSES, MAX_WORD_CHARS,
  cardPlacement, definitionApiUrl, dictionaryPageUrl, dictionarySearchUrl, fetchDefinitions, findBookMeaning,
  formOfLemma, htmlToText, languageOrder, lookupTarget, normaliseWord, parseWordMeanings, pickSenses, scriptOf,
  type Sense,
} from "./wordLookup";

// Select a word, see what it means: the book's own word-for-word meaning
// first, then the dictionary's. Nothing here may guess a meaning.

const ZWNJ = "‌";

describe("normaliseWord", () => {
  it("leaves a plain word as it is", () => {
    expect(normaliseWord("भौतिक")).toBe("भौतिक");
    expect(normaliseWord("dharma")).toBe("dharma");
  });

  it("drops the invisible joiner the scan leaves after a final consonant", () => {
    expect(normaliseWord(`भगवान्${ZWNJ}`)).toBe("भगवान्");
    expect(normaliseWord(`सताम्${ZWNJ}`)).toBe(normaliseWord("सताम्"));
  });

  it("trims the punctuation, dandas and verse numbers that cling to a selected word", () => {
    expect(normaliseWord("गुणाः ।")).toBe("गुणाः");
    expect(normaliseWord("वा ॥ ७ ॥")).toBe("वा");
    expect(normaliseWord("“कृष्ण-कृष्ण”")).toBe("कृष्ण-कृष्ण");
    expect(normaliseWord("  करते, ")).toBe("करते");
    expect(normaliseWord("(वसुदेव")).toBe("वसुदेव");
  });

  it("keeps a hyphen inside a word (boundary)", () => {
    expect(normaliseWord("जन्म-आदि")).toBe("जन्म-आदि");
    expect(normaliseWord("-जन्म-आदि-")).toBe("जन्म-आदि");
  });

  it("is empty for anything that is not text (negative case)", () => {
    for (const raw of [null, undefined, 12, {}, "", "   ", "।", "॥ १२ ॥", "—"]) {
      expect(normaliseWord(raw), String(raw)).toBe("");
    }
  });
});

describe("lookupTarget", () => {
  it("is the word for a selection of one word", () => {
    expect(lookupTarget("भौतिक")).toBe("भौतिक");
    expect(lookupTarget(" hackneys, ")).toBe("hackneys");
    expect(lookupTarget("गुणाः ।")).toBe("गुणाः");
  });

  it("is nothing for several words: that is the selection toolbar's (negative case)", () => {
    expect(lookupTarget("भौतिक जगत")).toBeNull();
    expect(lookupTarget("in this manner")).toBeNull();
    expect(lookupTarget("सत्त्वं\nरजस्तम")).toBeNull();
  });

  it("is nothing for an empty selection, a lone character or bare punctuation (negative case)", () => {
    for (const raw of ["", "   ", "न", "a", "।", "॥ ७ ॥", "123", "—", null, undefined]) {
      expect(lookupTarget(raw), String(raw)).toBeNull();
    }
  });

  it("takes a two-letter word and refuses anything too long to be a word (boundary)", () => {
    expect(lookupTarget("वा")).toBe("वा");
    expect(lookupTarget("क".repeat(MAX_WORD_CHARS))).toBe("क".repeat(MAX_WORD_CHARS));
    expect(lookupTarget("क".repeat(MAX_WORD_CHARS + 1))).toBeNull();
  });
});

describe("scriptOf and languageOrder", () => {
  it("tells Devanagari from Latin", () => {
    expect(scriptOf("धर्म")).toBe("devanagari");
    expect(scriptOf("dharma")).toBe("latin");
    expect(scriptOf("ধর্ম")).toBe("other");
    expect(scriptOf("123")).toBe("other");
  });

  it("a word of a verse is Sanskrit before it is Hindi", () => {
    expect(languageOrder("धर्मः", true)).toEqual(["sa", "hi"]);
  });

  it("a word of the translation or purport is Hindi first", () => {
    expect(languageOrder("भौतिक", false)).toEqual(["hi", "sa"]);
  });

  it("an English word is looked up in English, wherever it is", () => {
    expect(languageOrder("material", false)).toEqual(["en"]);
    expect(languageOrder("material", true)).toEqual(["en"]);
  });

  it("a word in a script the dictionary is not asked about has no languages (negative case)", () => {
    expect(languageOrder("ধর্ম", false)).toEqual([]);
  });
});

describe("parseWordMeanings — the book's शब्दार्थ", () => {
  it("reads word—meaning pairs separated by semicolons", () => {
    expect(parseWordMeanings("सत्त्वम्—सतोगुण; रजः—रजोगुण; इति—इस प्रकार; प्रकृतेः—भौतिक प्रकृति के")).toEqual([
      { word: "सत्त्वम्", meaning: "सतोगुण" },
      { word: "रजः", meaning: "रजोगुण" },
      { word: "इति", meaning: "इस प्रकार" },
      { word: "प्रकृतेः", meaning: "भौतिक प्रकृति के" },
    ]);
  });

  it("copes with the spaces and joiners the scan puts around the dash", () => {
    expect(parseWordMeanings(`भगवते— भगवान्${ZWNJ} को; वासुदेवाय — वासुदेव`)).toEqual([
      { word: "भगवते", meaning: "भगवान् को" },
      { word: "वासुदेवाय", meaning: "वासुदेव" },
    ]);
  });

  it("keeps a hyphenated headword whole", () => {
    expect(parseWordMeanings("जन्म-आदि—उत्पत्ति, पालन तथा संहार; ताप-त्रय—तीन प्रकार के कष्ट")).toEqual([
      { word: "जन्म-आदि", meaning: "उत्पत्ति, पालन तथा संहार" },
      { word: "ताप-त्रय", meaning: "तीन प्रकार के कष्ट" },
    ]);
  });

  it("drops a pair whose headword the scan lost, rather than invent one (negative case)", () => {
    expect(parseWordMeanings("ॐ—हे प्रभु; — नमस्कार है; भगवते—भगवान् को")).toEqual([
      { word: "ॐ", meaning: "हे प्रभु" },
      { word: "भगवते", meaning: "भगवान् को" },
    ]);
  });

  it("splits a run where the scan lost the semicolon between two pairs", () => {
    expect(parseWordMeanings("धर्मः— धार्मिकता प्रोज्झित—पूर्ण रूप से अस्वीकृत; अत्र—यहाँ")).toEqual([
      { word: "धर्मः", meaning: "धार्मिकता" },
      { word: "प्रोज्झित", meaning: "पूर्ण रूप से अस्वीकृत" },
      { word: "अत्र", meaning: "यहाँ" },
    ]);
  });

  it("drops a headword left with no meaning (negative case)", () => {
    expect(parseWordMeanings("धर्मः—; अत्र—यहाँ")).toEqual([{ word: "अत्र", meaning: "यहाँ" }]);
    expect(parseWordMeanings("धर्मः—प्रोज्झित—अस्वीकृत")).toEqual([{ word: "प्रोज्झित", meaning: "अस्वीकृत" }]);
  });

  it("reads en dashes and horizontal bars as the dash too (boundary)", () => {
    expect(parseWordMeanings("अत्र–यहाँ; परमः―सर्वोच्च")).toEqual([
      { word: "अत्र", meaning: "यहाँ" },
      { word: "परमः", meaning: "सर्वोच्च" },
    ]);
  });

  it("has nothing to read in text with no pairs (negative case)", () => {
    for (const raw of ["", "   ", "शब्दार्थ", "यह एक साधारण वाक्य है।", null, undefined, 7]) {
      expect(parseWordMeanings(raw), String(raw)).toEqual([]);
    }
  });
});

describe("findBookMeaning", () => {
  const nearest = "सत्त्वम्—सतोगुण; इति—इस प्रकार; न—नहीं; गुणाः—गुण";
  const further = "इति—इस तरह; काले—समय में";

  it("finds the meaning of a word selected in the verse", () => {
    expect(findBookMeaning("इति", [nearest])).toEqual({ word: "इति", meaning: "इस प्रकार" });
    expect(findBookMeaning("गुणाः ।", [nearest])).toEqual({ word: "गुणाः", meaning: "गुण" });
  });

  it("takes the nearest verse's meaning when two verses gloss the same word", () => {
    expect(findBookMeaning("इति", [nearest, further])?.meaning).toBe("इस प्रकार");
    expect(findBookMeaning("इति", [further, nearest])?.meaning).toBe("इस तरह");
  });

  it("looks in the further texts when the nearest does not have the word", () => {
    expect(findBookMeaning("काले", [nearest, further])).toEqual({ word: "काले", meaning: "समय में" });
  });

  it("matches a word however the joiner was scanned", () => {
    expect(findBookMeaning("सताम्", [`सताम्${ZWNJ}— भक्तों को`])?.meaning).toBe("भक्तों को");
    expect(findBookMeaning(`सताम्${ZWNJ}`, ["सताम्—भक्तों को"])?.meaning).toBe("भक्तों को");
  });

  it("does not guess: a sandhi-joined form or a near miss has no book meaning (negative case)", () => {
    // The verse prints प्रकृतेर्नात्मनो; the gloss has प्रकृतेः, न and आत्मनः separately.
    expect(findBookMeaning("प्रकृतेर्नात्मनो", ["प्रकृतेः—भौतिक प्रकृति के; न—नहीं; आत्मनः—आत्मा के"])).toBeNull();
    expect(findBookMeaning("गुण", [nearest])).toBeNull();
    expect(findBookMeaning("सत्त्व", [nearest])).toBeNull();
  });

  it("has nothing for no word or no texts (negative case)", () => {
    expect(findBookMeaning("", [nearest])).toBeNull();
    expect(findBookMeaning("इति", [])).toBeNull();
    expect(findBookMeaning("इति", ["", "शब्दार्थ"])).toBeNull();
  });
});

describe("the dictionary's addresses", () => {
  it("asks Wiktionary's definition service for the word, encoded", () => {
    expect(definitionApiUrl("धर्म")).toBe("https://en.wiktionary.org/api/rest_v1/page/definition/%E0%A4%A7%E0%A4%B0%E0%A5%8D%E0%A4%AE");
    expect(definitionApiUrl("a/b c")).toBe("https://en.wiktionary.org/api/rest_v1/page/definition/a%2Fb%20c");
  });

  it("links the full definition to the word's page, at its language", () => {
    expect(dictionaryPageUrl("material", "English")).toBe("https://en.wiktionary.org/wiki/material#English");
    expect(dictionaryPageUrl("धर्म", "Old Gujarati")).toBe("https://en.wiktionary.org/wiki/%E0%A4%A7%E0%A4%B0%E0%A5%8D%E0%A4%AE#Old_Gujarati");
    expect(dictionaryPageUrl("material")).toBe("https://en.wiktionary.org/wiki/material");
    expect(dictionaryPageUrl("material", null)).toBe("https://en.wiktionary.org/wiki/material");
  });

  it("offers a search when there is no entry", () => {
    expect(dictionarySearchUrl("सतोगुण")).toBe("https://en.wiktionary.org/w/index.php?search=%E0%A4%B8%E0%A4%A4%E0%A5%8B%E0%A4%97%E0%A5%81%E0%A4%A3");
  });

  it("names the site in the header Wikimedia asks callers to send", () => {
    expect(API_USER_AGENT).toMatch(/^BuildIskconReader\/\d+\.\d+ \(https:\/\/buildiskcon\.com\)$/);
  });
});

describe("htmlToText", () => {
  it("removes tags and keeps the words", () => {
    expect(htmlToText('<a href="/wiki/free">free</a>, <i>liberated</i>')).toBe("free, liberated");
  });

  it("removes a style block together with its contents", () => {
    expect(htmlToText('chief aim <style data-mw="x">.mw-parser-output .object-usage-tag{font-style:italic}</style><span class="object-usage-tag">[with locative]</span>'))
      .toBe("chief aim [with locative]");
  });

  it("decodes entities", () => {
    expect(htmlToText("law &amp; order &lt;sic&gt; &quot;x&quot; &#39;y&#39; &#x915;&nbsp;z")).toBe('law & order <sic> "x" \'y\' क z');
  });

  it("keeps list items on their own lines", () => {
    expect(htmlToText("inflection of <b>करना</b> (karnā):<ol><li>masculine plural habitual participle</li><li>masculine plural contrafactual</li></ol>"))
      .toBe("inflection of करना (karnā):\nmasculine plural habitual participle\nmasculine plural contrafactual");
  });

  it("is empty for nothing (negative case)", () => {
    for (const raw of [null, undefined, 3, "", "   ", "<p></p>", "<style>a{}</style>"]) {
      expect(htmlToText(raw), String(raw)).toBe("");
    }
  });
});

// A response shaped like Wiktionary's, cut down.
const MUKTA = {
  hi: [{ partOfSpeech: "Adjective", language: "Hindi", definitions: [{ definition: "<a>free</a>" }, { definition: "liberated, unfettered" }] }],
  mr: [{ partOfSpeech: "Adjective", language: "Marathi", definitions: [{ definition: "free, liberated" }] }],
  sa: [
    { partOfSpeech: "Adjective", language: "Sanskrit", definitions: [{ definition: "discharged, abandoned" }, { definition: "free" }] },
    { partOfSpeech: "Participle", language: "Sanskrit", definitions: [{ definition: "past participle of <b>मुच्</b> (muc)" }] },
  ],
};

describe("pickSenses", () => {
  it("shows only the languages that fit, in the order asked", () => {
    const senses = pickSenses(MUKTA, ["hi", "sa"]);
    expect(senses.map(s => `${s.language}/${s.partOfSpeech}`)).toEqual(["Hindi/Adjective", "Sanskrit/Adjective", "Sanskrit/Participle"]);
    expect(pickSenses(MUKTA, ["sa", "hi"]).map(s => s.code)).toEqual(["sa", "sa", "hi"]);
  });

  it("never shows a language that was not asked for", () => {
    expect(pickSenses(MUKTA, ["hi", "sa"]).some(s => s.language === "Marathi")).toBe(false);
    expect(pickSenses(MUKTA, ["en"])).toEqual([]);
  });

  it("gives the definitions as plain text", () => {
    expect(pickSenses(MUKTA, ["hi"])[0].definitions).toEqual(["free", "liberated, unfettered"]);
  });

  it("joins a definition's lines on one line", () => {
    const karte = { hi: [{ partOfSpeech: "Verb", language: "Hindi", definitions: [{ definition: "inflection of करना (karnā):<ol><li>masculine plural habitual participle</li></ol>" }] }] };
    expect(pickSenses(karte, ["hi"])[0].definitions).toEqual(["inflection of करना (karnā): · masculine plural habitual participle"]);
  });

  it("caps the definitions under each sense and the senses overall (boundary)", () => {
    const many = { hi: Array.from({ length: 7 }, (_, i) => ({ partOfSpeech: `P${i}`, language: "Hindi", definitions: Array.from({ length: 9 }, (_, j) => ({ definition: `d${j}` })) })) };
    const senses = pickSenses(many, ["hi"]);
    expect(senses).toHaveLength(MAX_SENSES);
    expect(senses[0].definitions).toHaveLength(MAX_DEFINITIONS);
  });

  it("skips a sense whose definitions are all empty", () => {
    const hollow = { hi: [{ partOfSpeech: "Noun", language: "Hindi", definitions: [{ definition: "" }, { definition: "<style>x{}</style>" }] }, { partOfSpeech: "Verb", language: "Hindi", definitions: [{ definition: "to do" }] }] };
    expect(pickSenses(hollow, ["hi"]).map(s => s.partOfSpeech)).toEqual(["Verb"]);
  });

  it("is empty for a response that is not a definition (negative case)", () => {
    for (const raw of [null, undefined, "text", 4, [], {}, { hi: "x" }, { hi: [null, 3] }, { title: "Not found.", detail: "…" }]) {
      expect(pickSenses(raw, ["hi", "sa"]), JSON.stringify(raw)).toEqual([]);
    }
  });
});

const sense = (definition: string, code = "hi"): Sense => ({ code, language: code === "hi" ? "Hindi" : "Sanskrit", partOfSpeech: "Verb", definitions: [definition] });

describe("formOfLemma", () => {
  it("finds the word an inflected form belongs to", () => {
    expect(formOfLemma([sense("inflection of करना (karnā): · masculine plural habitual participle")], "करते")).toBe("करना");
  });

  it("finds the word an alternative spelling stands for", () => {
    expect(formOfLemma([sense("alternative spelling of भगवान (bhagvān)")], "भगवान्")).toBe("भगवान");
  });

  it("drops the accent marks the dictionary prints on a Sanskrit headword", () => {
    expect(formOfLemma([sense("masculine nominative singular of भग॑वत् (bhágavat)", "sa")], "भगवान्")).toBe("भगवत्");
  });

  it("is nothing when the word has a real definition of its own (negative case)", () => {
    expect(formOfLemma([sense("free"), sense("past participle of मुच् (muc)", "sa")], "मुक्त")).toBeNull();
    expect(formOfLemma([sense("religion, faith")], "धर्म")).toBeNull();
  });

  it("does not send the reader from a word to itself (boundary)", () => {
    expect(formOfLemma([sense("alternative form of धर्म (dharma)")], "धर्म")).toBeNull();
  });

  it("an English form needs a grammar label: \"a kind of horse\" is a definition", () => {
    expect(formOfLemma([sense("plural of hackney", "en")], "hackneys")).toBe("hackney");
    expect(formOfLemma([sense("a kind of horse", "en")], "hackney")).toBeNull();
  });

  it("is nothing for no senses (negative case)", () => {
    expect(formOfLemma([], "करते")).toBeNull();
  });
});

describe("fetchDefinitions", () => {
  const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

  it("returns the word's senses, asking with the site's name", async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const result = await fetchDefinitions("मुक्त", false, async (url, init) => { calls.push({ url, headers: init?.headers }); return json(MUKTA); });
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.senses[0]).toMatchObject({ language: "Hindi", definitions: ["free", "liberated, unfettered"] });
    expect(result.lemma).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(definitionApiUrl("मुक्त"));
    expect(calls[0].headers).toEqual({ "Api-User-Agent": API_USER_AGENT });
  });

  it("puts Sanskrit first for a word of a verse", async () => {
    const result = await fetchDefinitions("मुक्त", true, async () => json(MUKTA));
    expect(result.status === "found" && result.senses[0].language).toBe("Sanskrit");
  });

  it("follows an inflected form to its word, one step only", async () => {
    const urls: string[] = [];
    const result = await fetchDefinitions("करते", false, async (url) => {
      urls.push(url);
      if (url === definitionApiUrl("करते")) return json({ hi: [{ partOfSpeech: "Verb", language: "Hindi", definitions: [{ definition: "inflection of करना (karnā):" }] }] });
      // करना's own first definition is again a form-of line: it must not be followed further.
      return json({ hi: [{ partOfSpeech: "Verb", language: "Hindi", definitions: [{ definition: "alternative form of कर्ना (karnā)" }, { definition: "to do" }] }] });
    });
    expect(urls).toEqual([definitionApiUrl("करते"), definitionApiUrl("करना")]);
    expect(result.status === "found" && result.lemma?.word).toBe("करना");
    expect(result.status === "found" && result.lemma?.senses[0].definitions).toEqual(["alternative form of कर्ना (karnā)", "to do"]);
  });

  it("still shows the form when its word cannot be fetched", async () => {
    const result = await fetchDefinitions("करते", false, async (url) => {
      if (url === definitionApiUrl("करते")) return json({ hi: [{ partOfSpeech: "Verb", language: "Hindi", definitions: [{ definition: "inflection of करना (karnā):" }] }] });
      throw new Error("offline");
    });
    expect(result).toMatchObject({ status: "found", lemma: null });
  });

  it("reports a word the dictionary does not have as not found (negative case)", async () => {
    expect(await fetchDefinitions("सतोगुण", false, async () => json({ title: "Not found." }, 404))).toEqual({ status: "not-found" });
  });

  it("reports an entry in other languages only as not found", async () => {
    expect(await fetchDefinitions("धर्म", false, async () => json({ mr: MUKTA.mr }))).toEqual({ status: "not-found" });
  });

  it("does not call the dictionary for a script it has no language for", async () => {
    let called = false;
    expect(await fetchDefinitions("ধর্ম", false, async () => { called = true; return json({}); })).toEqual({ status: "not-found" });
    expect(called).toBe(false);
  });

  it("reports a failure as a failure, not as \"no such word\" (negative case)", async () => {
    expect(await fetchDefinitions("धर्म", false, async () => json({}, 503))).toEqual({ status: "error" });
    expect(await fetchDefinitions("धर्म", false, async () => { throw new Error("offline"); })).toEqual({ status: "error" });
    expect(await fetchDefinitions("धर्म", false, async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }))).toEqual({ status: "error" });
  });
});

describe("cardPlacement", () => {
  const viewport = { width: 1280, height: 800 };
  const card = { width: 320, height: 200 };

  it("sits centred under the word", () => {
    const p = cardPlacement({ left: 600, top: 300, bottom: 320, width: 80 }, viewport, card);
    expect(p).toEqual({ left: 480, top: 320 + CARD_GAP_PX, placement: "below" });
  });

  it("stays inside the window at the left and right edges (boundary)", () => {
    expect(cardPlacement({ left: 4, top: 300, bottom: 320, width: 40 }, viewport, card).left).toBe(CARD_MARGIN_PX);
    expect(cardPlacement({ left: 1240, top: 300, bottom: 320, width: 36 }, viewport, card).left).toBe(1280 - 320 - CARD_MARGIN_PX);
  });

  it("goes above the word when there is no room below", () => {
    const p = cardPlacement({ left: 600, top: 700, bottom: 720, width: 80 }, viewport, card);
    expect(p.placement).toBe("above");
    expect(p.top).toBe(700 - CARD_GAP_PX - 200);
  });

  it("just fits below (boundary)", () => {
    const bottom = 800 - CARD_MARGIN_PX - 200 - CARD_GAP_PX;
    expect(cardPlacement({ left: 600, top: bottom - 20, bottom, width: 80 }, viewport, card).placement).toBe("below");
    expect(cardPlacement({ left: 600, top: bottom - 19, bottom: bottom + 1, width: 80 }, viewport, card).placement).toBe("above");
  });

  it("with room neither above nor below, stays on screen under the top edge (negative case)", () => {
    const p = cardPlacement({ left: 100, top: 100, bottom: 250, width: 60 }, { width: 375, height: 300 }, card);
    expect(p.placement).toBe("below");
    expect(p.top).toBe(300 - 200 - CARD_MARGIN_PX);
    expect(p.top + card.height).toBeLessThanOrEqual(300);
  });

  it("on a phone narrower than the card's margins it still starts at the margin", () => {
    expect(cardPlacement({ left: 150, top: 100, bottom: 120, width: 40 }, { width: 320, height: 640 }, { width: 304, height: 200 }).left).toBe(CARD_MARGIN_PX);
  });
});
