import { describe, it, expect } from "vitest";
import {
  isGarbagePage,
  isStandalonePageNumber,
  stripLeadingPageNumber,
  cleanOcrText,
  extractChapterNum,
  toHindiChapterLine,
  isChapterHeading,
  countHindiPostpositions,
  countVisarga,
  countSanskritParticles,
  countSanskritEndings,
  sanskritScore,
  isVerseLike,
  parseSections,
  getPageEndKind,
  buildChapterIndex,
  type PageContent,
} from "./bhagwatham-utils";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. isGarbagePage — filter out noise / non-Devanagari / too-short pages
// ═══════════════════════════════════════════════════════════════════════════════

describe("isGarbagePage", () => {
  it("returns true for empty or very short text", () => {
    expect(isGarbagePage("")).toBe(true);
    expect(isGarbagePage("abc")).toBe(true);
    expect(isGarbagePage("short")).toBe(true);
  });

  it("returns true for text with < 40% Devanagari", () => {
    expect(isGarbagePage("This is entirely English text with no Hindi at all and it is long enough to pass the length check.")).toBe(true);
  });

  it("returns true for text with > 25% ASCII junk", () => {
    expect(isGarbagePage("ABC@#$%^& हिन्दी text here with some more junk 12345 and symbols {} []")).toBe(true);
  });

  it("returns false for valid Devanagari text", () => {
    expect(isGarbagePage("श्रीमद्भागवतम् महापुराण के प्रथम स्कन्ध में यह बताया गया है कि भगवान् विष्णु ने")).toBe(false);
  });

  it("returns true for whitespace-only text", () => {
    expect(isGarbagePage("                    ")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. isStandalonePageNumber — detect OCR page number artifacts
// ═══════════════════════════════════════════════════════════════════════════════

describe("isStandalonePageNumber", () => {
  it("detects plain page numbers", () => {
    expect(isStandalonePageNumber("43")).toBe(true);
    expect(isStandalonePageNumber("430")).toBe(true);
    expect(isStandalonePageNumber("7")).toBe(true);
  });

  it("detects page numbers with trailing bracket", () => {
    expect(isStandalonePageNumber("42]")).toBe(true);
    expect(isStandalonePageNumber("123)")).toBe(true);
  });

  it("does not match text lines", () => {
    expect(isStandalonePageNumber("43 सूत उवाच")).toBe(false);
    expect(isStandalonePageNumber("श्रीमद्भागवतम्")).toBe(false);
  });

  it("handles leading/trailing spaces", () => {
    expect(isStandalonePageNumber("  430  ")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. stripLeadingPageNumber — remove OCR page numbers from line starts
// ═══════════════════════════════════════════════════════════════════════════════

describe("stripLeadingPageNumber", () => {
  it("strips 2+ digit leading page numbers", () => {
    expect(stripLeadingPageNumber("430 सूत उवाच")).toBe("सूत उवाच");
    expect(stripLeadingPageNumber("42 दर्शन")).toBe("दर्शन");
  });

  it("strips page numbers with brackets", () => {
    expect(stripLeadingPageNumber("42] दर्शन")).toBe("दर्शन");
  });

  it("does NOT strip single-digit (to preserve numbered lists)", () => {
    expect(stripLeadingPageNumber("1) श्रवण")).toBe("1) श्रवण");
  });

  it("leaves lines without leading numbers unchanged", () => {
    expect(stripLeadingPageNumber("तात्पर्य : भगवान्")).toBe("तात्पर्य : भगवान्");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. cleanOcrText — clean up OCR artifacts while preserving structure
// ═══════════════════════════════════════════════════════════════════════════════

describe("cleanOcrText", () => {
  it("removes standalone page number lines", () => {
    const result = cleanOcrText("6\n\nशब्दार्थ");
    expect(result).not.toMatch(/^6\b/);
    expect(result).toContain("शब्दार्थ");
  });

  it("removes copyright symbols", () => {
    expect(cleanOcrText("श्लोक © प्रकाशक")).not.toContain("©");
  });

  it("collapses multiple blank lines", () => {
    const result = cleanOcrText("पहली पंक्ति\n\n\n\n\nदूसरी पंक्ति");
    expect(result).toBe("पहली पंक्ति\n\nदूसरी पंक्ति");
  });

  it("collapses multiple spaces", () => {
    const result = cleanOcrText("शब्द    अर्थ");
    expect(result).toBe("शब्द अर्थ");
  });

  it("removes stray ASCII fragments between Devanagari", () => {
    const result = cleanOcrText("भगवान् abc विष्णु");
    expect(result).not.toContain("abc");
  });

  it("preserves OCR chapter fix headings", () => {
    const result = cleanOcrText("Chapter 278 अध्याय");
    expect(result).toContain("Chapter 278 अध्याय");
  });

  it("removes double semicolons", () => {
    expect(cleanOcrText("शब्द; ; अर्थ")).toBe("शब्द; अर्थ");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. extractChapterNum — extract chapter number from heading line
// ═══════════════════════════════════════════════════════════════════════════════

describe("extractChapterNum", () => {
  it("extracts Hindi word numbers", () => {
    expect(extractChapterNum("अध्याय एक")).toBe(1);
    expect(extractChapterNum("अध्याय दस")).toBe(10);
    expect(extractChapterNum("अध्याय बीस")).toBe(20);
  });

  it("extracts digit numbers", () => {
    expect(extractChapterNum("अध्याय 5")).toBe(5);
    expect(extractChapterNum("Chapter 12")).toBe(12);
  });

  it("handles OCR-mangled headings", () => {
    expect(extractChapterNum("Chapter 278 अध्याय")).toBe(8);
    expect(extractChapterNum("अध्याय आठ")).toBe(8);
  });

  it("rejects unreasonably large chapter numbers (> 100)", () => {
    expect(extractChapterNum("Chapter 999")).toBe(0);
  });

  it("returns 0 for unrecognized lines", () => {
    expect(extractChapterNum("कोई भी पंक्ति")).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. toHindiChapterLine — normalize chapter heading to Hindi
// ═══════════════════════════════════════════════════════════════════════════════

describe("toHindiChapterLine", () => {
  it("converts 'Chapter X' to 'अध्याय X'", () => {
    expect(toHindiChapterLine("Chapter 5")).toBe("अध्याय 5");
    expect(toHindiChapterLine("Chapter दो")).toBe("अध्याय दो");
  });

  it("fixes OCR-mangled headings", () => {
    expect(toHindiChapterLine("Chapter 278 अध्याय")).toBe("अध्याय आठ");
    expect(toHindiChapterLine("Chapter it")).toBe("अध्याय नौ");
  });

  it("strips leading page numbers", () => {
    expect(toHindiChapterLine("42 अध्याय दो")).toBe("अध्याय दो");
  });

  it("passes through already-Hindi headings", () => {
    expect(toHindiChapterLine("अध्याय तीन")).toBe("अध्याय तीन");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. isChapterHeading — detect chapter heading lines
// ═══════════════════════════════════════════════════════════════════════════════

describe("isChapterHeading", () => {
  it("detects Hindi chapter headings", () => {
    expect(isChapterHeading("अध्याय एक")).toBe(true);
    expect(isChapterHeading("अध्याय बीस")).toBe(true);
    expect(isChapterHeading("अध्याय 5")).toBe(true);
  });

  it("detects English chapter headings", () => {
    expect(isChapterHeading("Chapter 1")).toBe(true);
    expect(isChapterHeading("Chapter दो")).toBe(true);
  });

  it("detects OCR-mangled headings", () => {
    expect(isChapterHeading("Chapter 278 अध्याय")).toBe(true);
    expect(isChapterHeading("Chapter it")).toBe(true);
  });

  it("rejects 'पूर्ण हुए' lines (skandh endings)", () => {
    expect(isChapterHeading("अध्याय पूर्ण हुए")).toBe(false);
  });

  it("rejects regular text", () => {
    expect(isChapterHeading("भगवान् ने कहा")).toBe(false);
    expect(isChapterHeading("तात्पर्य : यह")).toBe(false);
  });

  it("handles leading page numbers", () => {
    expect(isChapterHeading("42 Chapter दो")).toBe(true);
    expect(isChapterHeading("430 अध्याय तीन")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Hindi/Sanskrit detection helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe("countHindiPostpositions", () => {
  it("counts Hindi postpositions in a prose line", () => {
    const line = "भगवान् के भक्त को माया में कभी विचलित नहीं होता";
    expect(countHindiPostpositions(line)).toBeGreaterThanOrEqual(3);
  });

  it("returns 0 for pure Sanskrit lines", () => {
    expect(countHindiPostpositions("प्रकृतेः क्रियमाणानि गुणैः कर्माणि सर्वशः")).toBe(0);
  });
});

describe("countVisarga", () => {
  it("counts visarga characters", () => {
    expect(countVisarga("दुःखेष्वनुद्विग्नमनाः सुखेषु")).toBe(2);
    expect(countVisarga("सः एषः")).toBe(2);
  });

  it("returns 0 when no visarga", () => {
    expect(countVisarga("भगवान ने कहा")).toBe(0);
  });
});

describe("countSanskritParticles", () => {
  it("detects Sanskrit particles", () => {
    expect(countSanskritParticles("यदा यदा हि धर्मस्य")).toBeGreaterThanOrEqual(2);
  });
});

describe("countSanskritEndings", () => {
  it("detects Sanskrit case endings", () => {
    expect(countSanskritEndings("धर्मस्य ग्लानिः")).toBeGreaterThanOrEqual(1);
  });
});

describe("sanskritScore", () => {
  it("gives high score to Sanskrit lines", () => {
    expect(sanskritScore("दुःखेष्वनुद्विग्नमनाः सुखेषु विगतस्पृहः")).toBeGreaterThan(4);
  });

  it("gives low score to Hindi prose", () => {
    expect(sanskritScore("भगवान ने अपने भक्त को बताया")).toBeLessThan(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. isVerseLike — detect Sanskrit verse lines
// ═══════════════════════════════════════════════════════════════════════════════

describe("isVerseLike", () => {
  it("returns true for Sanskrit verse lines", () => {
    expect(isVerseLike("स्वयं धनुर्द्वारि निधाय मायां")).toBe(true);
    expect(isVerseLike("भ्रातुः पुरो मर्मसु ताडितोऽपि")).toBe(true);
  });

  it("returns false for Hindi prose with verbs + postpositions", () => {
    expect(isVerseLike("विदुर ने अपना धनुष दरवाजे पर रख दिया और अपने भाई के महल को छोड़ दिया")).toBe(false);
  });

  it("returns false for section markers", () => {
    expect(isVerseLike("तात्पर्य : भगवान्")).toBe(false);
    expect(isVerseLike("शब्दार्थ")).toBe(false);
    expect(isVerseLike("अनुवाद")).toBe(false);
  });

  it("returns false for shabdarth-like lines with — and ;", () => {
    expect(isVerseLike("स्वयम्—स्वयं; धनुः द्वारि—दरवाजे पर धनुष; निधाय—रखकर")).toBe(false);
  });

  it("returns false for very short lines", () => {
    expect(isVerseLike("हरि")).toBe(false);
  });

  it("returns false for very long lines (> 120 chars)", () => {
    const longLine = "भगवान् विष्णु ".repeat(20);
    expect(isVerseLike(longLine)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. parseSections — the core section classification engine
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseSections", () => {
  it("detects chapter headings", () => {
    const sections = parseSections("अध्याय एक\nसृष्टि का वर्णन");
    expect(sections[0].kind).toBe("chapter");
    expect(sections[0].chapterNum).toBe(1);
  });

  it("detects shlok lines with ॥", () => {
    const text = "स्वयं धनुर्द्वारि निधाय मायां\nभ्रातुः पुरो मर्मसु ताडितोऽपि ।\nस इत्थमत्युल्बणकर्णबाणै-\nगतव्यथोऽयादुरु मानयानः ॥ १६ ॥";
    const sections = parseSections(text);
    const shlok = sections.find(s => s.kind === "shlok");
    expect(shlok).toBeDefined();
    expect(shlok!.lines.length).toBeGreaterThanOrEqual(1);
  });

  it("detects तात्पर्य sections", () => {
    const text = "तात्पर्य : भगवान् का शुद्ध भक्त ईश्वर की बहिरंगा शक्ति द्वारा उत्पन्न विषम परिस्थिति से कभी विचलित नहीं होता।";
    const sections = parseSections(text);
    const tatparya = sections.find(s => s.kind === "tatparya");
    expect(tatparya).toBeDefined();
    expect(tatparya!.lines[0]).toContain("भगवान्");
  });

  it("strips तात्पर्य prefix from content", () => {
    const text = "तात्पर्य : यह एक महत्वपूर्ण विषय है।";
    const sections = parseSections(text);
    const tatparya = sections.find(s => s.kind === "tatparya");
    expect(tatparya).toBeDefined();
    expect(tatparya!.lines[0]).not.toMatch(/^तात्पर्य/);
  });

  it("detects शब्दार्थ sections", () => {
    const text = "शब्दार्थ\nस्वयम्—स्वयं; धनुः द्वारि—दरवाजे पर धनुष";
    const sections = parseSections(text);
    const shabdarth = sections.find(s => s.kind === "shabdarth");
    expect(shabdarth).toBeDefined();
  });

  it("retroactively classifies text before शब्दार्थ as shlok", () => {
    const text = "स्वयं धनुर्द्वारि निधाय मायां\nशब्दार्थ\nस्वयम्—स्वयं; धनुः—धनुष";
    const sections = parseSections(text);
    // The first section (before शब्दार्थ) should be reclassified as shlok
    expect(sections[0].kind).toBe("shlok");
  });

  it("transitions from shabdarth to anuvad when — disappears", () => {
    const text = "शब्दार्थ\nस्वयम्—स्वयं; धनुः—धनुष\nइस तरह अपने कानों से होकर वाणों द्वारा बेधे गये";
    const sections = parseSections(text);
    const anuvad = sections.find(s => s.kind === "anuvad");
    expect(anuvad).toBeDefined();
    expect(anuvad!.lines[0]).toContain("इस तरह");
  });

  it("detects ref-shlok inside tatparya", () => {
    const text = "तात्पर्य : कुछ व्याख्या\nप्रकृतेः क्रियमाणानि\nगुणैः कर्माणि सर्वशः ॥";
    const sections = parseSections(text);
    const refShlok = sections.find(s => s.kind === "ref-shlok");
    expect(refShlok).toBeDefined();
  });

  it("returns to tatparya after ref-shlok", () => {
    const text = "तात्पर्य : पहली व्याख्या\nप्रकृतेः क्रियमाणानि\nगुणैः कर्माणि सर्वशः ॥\nबद्धात्मा बहिरंगा शक्ति के प्रभाव में रहता है।";
    const sections = parseSections(text);
    const kinds = sections.map(s => s.kind);
    // tatparya → ref-shlok → tatparya
    expect(kinds).toContain("tatparya");
    expect(kinds).toContain("ref-shlok");
    // After the ref-shlok, it should return to tatparya
    const lastTatparya = sections.filter(s => s.kind === "tatparya");
    expect(lastTatparya.length).toBeGreaterThanOrEqual(1);
  });

  it("handles full shlok → shabdarth → anuvad → tatparya flow", () => {
    const text = [
      "स्वयं धनुर्द्वारि निधाय मायां",
      "भ्रातुः पुरो मर्मसु ताडितोऽपि ॥ १६ ॥",
      "शब्दार्थ",
      "स्वयम्—स्वयं; धनुः—धनुष",
      "इस तरह कानों से होकर वाणों द्वारा बेधे गये",
      "तात्पर्य : भक्त ईश्वर की शक्ति से कभी विचलित नहीं होता।",
    ].join("\n");
    const sections = parseSections(text);
    const kinds = sections.map(s => s.kind);
    expect(kinds).toEqual(["shlok", "shabdarth", "anuvad", "tatparya"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. parseSections — cross-page continuity (prevPageEndKind)
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseSections — cross-page continuity", () => {
  it("continues tatparya from previous page", () => {
    const text = "बद्धात्मा बहिरंगा शक्ति के विभिन्न गुणों के प्रभाव में रहता है।";
    const sections = parseSections(text, "tatparya");
    expect(sections[0].kind).toBe("tatparya");
  });

  it("continues anuvad from previous page", () => {
    const text = "विदुर ने अपना धनुष दरवाजे पर रख दिया।";
    const sections = parseSections(text, "anuvad");
    expect(sections[0].kind).toBe("anuvad");
  });

  it("starts as text by default (no prevPageEndKind)", () => {
    const text = "कुछ सामान्य पाठ्य यहाँ है।";
    const sections = parseSections(text);
    expect(sections[0].kind).toBe("text");
  });

  it("does NOT continue shlok from previous page (only tatparya/anuvad)", () => {
    const text = "कुछ सामान्य पंक्ति";
    const sections = parseSections(text, "shlok");
    expect(sections[0].kind).toBe("text");
  });

  it("new tatparya marker overrides continued anuvad", () => {
    const text = "अनुवाद जारी है\nतात्पर्य : नई व्याख्या शुरू";
    const sections = parseSections(text, "anuvad");
    expect(sections[0].kind).toBe("anuvad");
    expect(sections[1].kind).toBe("tatparya");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. getPageEndKind — determine what kind a page ends with
// ═══════════════════════════════════════════════════════════════════════════════

describe("getPageEndKind", () => {
  it("returns 'text' for empty text", () => {
    expect(getPageEndKind("")).toBe("text");
  });

  it("detects tatparya ending", () => {
    expect(getPageEndKind("कुछ श्लोक\nतात्पर्य : यह व्याख्या है\nऔर यह जारी है")).toBe("tatparya");
  });

  it("detects anuvad ending", () => {
    expect(getPageEndKind("कुछ श्लोक\nअनुवाद\nयह अनुवाद है")).toBe("anuvad");
  });

  it("detects shlok ending", () => {
    expect(getPageEndKind("स्वयं धनुर्द्वारि निधाय\nगतव्यथोऽयादुरु मानयानः ॥ १६ ॥")).toBe("shlok");
  });

  it("detects ref-shlok inside tatparya", () => {
    expect(getPageEndKind("तात्पर्य : व्याख्या\nगुणैः कर्माणि सर्वशः ॥")).toBe("ref-shlok");
  });

  it("resets to text on chapter heading", () => {
    expect(getPageEndKind("तात्पर्य : कुछ\nअध्याय दो")).toBe("text");
  });

  it("detects shabdarth ending", () => {
    expect(getPageEndKind("कुछ पाठ\nशब्दार्थ")).toBe("shabdarth");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. buildChapterIndex — build chapter list from pages
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildChapterIndex", () => {
  const makePages = (data: Array<{ pageNumber: number; text: string }>): PageContent[] =>
    data.map(d => ({ ...d }));

  it("builds a basic chapter index", () => {
    const pages = makePages([
      { pageNumber: 1, text: "अध्याय एक\nसृष्टि का वर्णन एवं विस्तृत व्याख्या प्रस्तुत है" },
      { pageNumber: 50, text: "अध्याय दो\nदिव्यज्ञान का सारांश यहाँ प्रस्तुत किया गया है" },
    ]);
    const chapters = buildChapterIndex(pages);
    expect(chapters.length).toBe(2);
    expect(chapters[0].number).toBe(1);
    expect(chapters[0].globalNumber).toBe(1);
    expect(chapters[1].number).toBe(2);
    expect(chapters[1].globalNumber).toBe(2);
  });

  it("detects skandh transitions when chapter numbers reset", () => {
    const pages = makePages([
      { pageNumber: 1, text: "अध्याय एक\nप्रथम स्कन्ध का पहला अध्याय यहाँ प्रारम्भ होता है" },
      { pageNumber: 50, text: "अध्याय दो\nप्रथम स्कन्ध का दूसरा अध्याय यहाँ दिया गया है" },
      { pageNumber: 100, text: "अध्याय एक\nद्वितीय स्कन्ध का पहला अध्याय शुरू होता है यहाँ" },
    ]);
    const chapters = buildChapterIndex(pages);
    expect(chapters.length).toBe(3);
    expect(chapters[0].skandh).toBe(1);
    expect(chapters[1].skandh).toBe(1);
    expect(chapters[2].skandh).toBe(2);
  });

  it("skips Table of Contents pages (2+ headings on one page)", () => {
    const pages = makePages([
      { pageNumber: 1, text: "अध्याय एक\nअध्याय दो\nअध्याय तीन" },
      { pageNumber: 50, text: "अध्याय एक\nयह वास्तविक अध्याय की शुरुआत है जहाँ विषय प्रारम्भ होता है" },
    ]);
    const chapters = buildChapterIndex(pages);
    // Should skip page 1 (ToC) and only have the real chapter from page 50
    expect(chapters.length).toBe(1);
    expect(chapters[0].pageNumber).toBe(50);
  });

  it("skips garbage pages", () => {
    const pages = makePages([
      { pageNumber: 1, text: "junk" },
      { pageNumber: 2, text: "अध्याय एक\nइस अध्याय में भगवान् के चरित्र का वर्णन किया गया है" },
    ]);
    const chapters = buildChapterIndex(pages);
    expect(chapters.length).toBe(1);
    expect(chapters[0].pageNumber).toBe(2);
  });

  it("de-duplicates chapters within the same skandh", () => {
    const pages = makePages([
      { pageNumber: 1, text: "अध्याय एक\nप्रथम अध्याय का प्रारम्भ यहाँ से होता है विस्तृत रूप में" },
      { pageNumber: 5, text: "अध्याय एक\nप्रथम अध्याय पुनः दिखाई देता है जो कि दोहराव है" },
    ]);
    const chapters = buildChapterIndex(pages);
    expect(chapters.length).toBe(1);
  });

  it("corrects OCR noise in chapter numbers (big jumps)", () => {
    const pages = makePages([
      { pageNumber: 1, text: "अध्याय 7\nसातवें अध्याय का विषय यहाँ प्रारम्भ होता है विस्तार से" },
      { pageNumber: 50, text: "Chapter 36\nअगले अध्याय का विषय जो कि आठवाँ अध्याय होना चाहिए" }, // OCR noise, should be 8
    ]);
    const chapters = buildChapterIndex(pages);
    expect(chapters[1].number).toBe(8); // corrected from 36
  });

  it("includes subtitle from subsequent lines", () => {
    const pages = makePages([
      { pageNumber: 1, text: "अध्याय एक\nसृष्टि का वर्णन\nउपशीर्षक यहाँ है" },
    ]);
    const chapters = buildChapterIndex(pages);
    expect(chapters[0].title).toContain("सृष्टि का वर्णन");
  });

  it("returns empty for no pages", () => {
    expect(buildChapterIndex([])).toEqual([]);
  });

  it("sorts by skandh then chapter number", () => {
    // Pages in order (like real data), just verifying sort output
    const pages = makePages([
      { pageNumber: 1, text: "अध्याय एक\nपहला अध्याय प्रथम स्कन्ध का जो कि शुरुआत है" },
      { pageNumber: 100, text: "अध्याय तीन\nतीसरा अध्याय प्रथम स्कन्ध का जो कि अंतिम है" },
      { pageNumber: 50, text: "अध्याय दो\nदूसरा अध्याय प्रथम स्कन्ध का जो कि मध्य में है" },
    ]);
    const chapters = buildChapterIndex(pages);
    const numbers = chapters.map(c => c.number);
    expect(numbers).toEqual([1, 2, 3]);
    expect(chapters.every(c => c.skandh === 1)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. Integration: full page content parsing end-to-end
// ═══════════════════════════════════════════════════════════════════════════════

describe("Integration: full page parsing", () => {
  it("parses a realistic Bhagwatham page with all section types", () => {
    const pageText = [
      "स्वयं धनुर्द्वारि निधाय मायां",
      "भ्रातुः पुरो मर्मसु ताडितोऽपि ।",
      "स इत्थमत्युल्बणकर्णबाणै-",
      "गतव्यथोऽयादुरु मानयानः ॥ १६ ॥",
      "शब्दार्थ",
      "स्वयम्—स्वयं; धनुः द्वारि—दरवाजे पर धनुष; निधाय—रखकर; मायाम्—माया",
      "इस तरह अपने कानों से होकर वाणों द्वारा बेधे गये और अपने हृदय के भीतर मर्माहत विदुर ने अपना धनुष दरवाजे पर रख दिया।",
      "तात्पर्य : भगवान् का शुद्ध भक्त ईश्वर की बहिरंगा शक्ति द्वारा उत्पन्न विषम परिस्थिति से कभी विचलित नहीं होता।",
    ].join("\n");

    const sections = parseSections(pageText);
    const kinds = sections.map(s => s.kind);

    expect(kinds).toContain("shlok");
    expect(kinds).toContain("shabdarth");
    expect(kinds).toContain("anuvad");
    expect(kinds).toContain("tatparya");
  });

  it("cross-page tatparya continuation works correctly", () => {
    // Page 1 ends with tatparya
    const page1 = "तात्पर्य : भगवान् का शुद्ध भक्त विषम परिस्थिति से कभी विचलित नहीं होता।";
    const endKind = getPageEndKind(page1);
    expect(endKind).toBe("tatparya");

    // Page 2 continues that tatparya
    const page2 = "बद्धात्मा बहिरंगा शक्ति के विभिन्न गुणों के प्रभाव के अन्तर्गत संसार में निमग्न रहता है।";
    const sections = parseSections(page2, endKind);
    expect(sections[0].kind).toBe("tatparya");
  });

  it("cross-page anuvad continuation works correctly", () => {
    // Use a page that explicitly ends in anuvad (shabdarth then prose without —)
    const page1 = "स्वयं धनुर्द्वारि निधाय ॥ १ ॥\nशब्दार्थ\nस्वयम्—स्वयं; धनुः—धनुष\nअनुवाद\nइस तरह विदुर ने अपना धनुष रख दिया";
    const endKind = getPageEndKind(page1);
    expect(endKind).toBe("anuvad");

    const page2 = "उन्हें कोई खेद नहीं था क्योंकि वे माया के कार्यों को सर्वोपरि मानते थे।";
    const sections = parseSections(page2, endKind);
    expect(sections[0].kind).toBe("anuvad");
  });
});
