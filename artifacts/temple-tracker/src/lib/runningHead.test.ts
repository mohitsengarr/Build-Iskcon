import { describe, expect, it } from "vitest";
import { isHeadTail, isRunningHead, isStandalonePageNumber, stripRunningHead } from "./runningHead";

describe("isRunningHead", () => {
  it("recognises the left-hand page's head, with a roman or Devanagari page number", () => {
    expect(isRunningHead("xxxiv श्रीचैतन्य-चरितामृत")).toBe(true);
    expect(isRunningHead("२ श्रीचैतन्य-चरितामृत आदि लीला, अध्याय १")).toBe(true);
    expect(isRunningHead("९८ श्रीचैतन्य-चरितामृत मध्य लीला, अध्याय २")).toBe(true);
  });

  it("recognises the right-hand page's head", () => {
    expect(isRunningHead("श्लोक १ ] गुरुवर्ग ३")).toBe(true);
    expect(isRunningHead("श्लोक १०३ ] श्री चैतन्य महाप्रभु के प्राकट्य के बाह्य कारण")).toBe(true);
    expect(isRunningHead("श्लोक ७ ]")).toBe(true);
  });

  it("recognises a front-matter head and a bare roman numeral", () => {
    expect(isRunningHead("परिचय xxi")).toBe(true);
    expect(isRunningHead("xliv")).toBe(true);
  });

  it("recognises the other books' heads", () => {
    expect(isRunningHead("४५ श्रीमद्भागवतम्")).toBe(true);
    expect(isRunningHead("श्रीमद्भगवद्गीता ८७")).toBe(true);
  });

  it("leaves the book's own text alone", () => {
    // The 17 first lines that are not furniture in 1,160 live pages
    for (const real of ["परिचय", "अध्याय १", "विषय-सूची", "भूमिका", "श्री श्रीगुरु-गौराङ्गौ जयतः"]) {
      expect(isRunningHead(real)).toBe(false);
    }
  });

  it("leaves a sentence that merely mentions the book alone", () => {
    const sentence = "श्रीचैतन्य-चरितामृत के अनुसार भक्ति ही जीव का नित्य धर्म है और यही सर्वोच्च साधन कहा गया है ।";
    expect(sentence.length).toBeGreaterThan(90);
    expect(isRunningHead(sentence)).toBe(false);
  });

  it("does not treat a verse line as a head", () => {
    expect(isRunningHead("धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ।")).toBe(false);
    expect(isRunningHead("श्लोक संख्या तीन सौ से अधिक हैं")).toBe(false);
  });

  it("handles rubbish input", () => {
    expect(isRunningHead("")).toBe(false);
    expect(isRunningHead("   ")).toBe(false);
    expect(isRunningHead(null)).toBe(false);
    expect(isRunningHead(undefined)).toBe(false);
    expect(isRunningHead(42)).toBe(false);
  });
});

describe("isStandalonePageNumber", () => {
  it("matches a page number in either script, with or without a stray bracket", () => {
    for (const n of ["43", "430", "42]", "९३", "१२३४", "9)"]) expect(isStandalonePageNumber(n)).toBe(true);
  });

  it("does not match text or a numbered verse", () => {
    for (const s of ["अध्याय १", "॥ ५ ॥", "123456", ""]) expect(isStandalonePageNumber(s)).toBe(false);
  });
});

describe("isHeadTail", () => {
  it("recognises the chapter title the scan left under a head", () => {
    expect(isHeadTail("गुरुवर्ग")).toBe(true);
    expect(isHeadTail("श्री चैतन्य महाप्रभु")).toBe(true);
  });

  it("refuses anything with sentence punctuation, digits or a section label", () => {
    for (const no of ["यह एक वाक्य है ।", "श्लोक ७", "अनुवाद", "तात्पर्य", "अध्याय एक", "राधा—कृष्ण; प्रेम"]) {
      expect(isHeadTail(no)).toBe(false);
    }
  });

  it("refuses a long line or one that is not Devanagari", () => {
    expect(isHeadTail("यह शीर्षक बहुत लम्बा है और इसलिए इसे शीर्षक नहीं माना जाएगा")).toBe(false);
    expect(isHeadTail("Guru-varga")).toBe(false);
    expect(isHeadTail("")).toBe(false);
  });
});

describe("stripRunningHead", () => {
  it("drops the head from the top of the page", () => {
    const page = ["xxxiv श्रीचैतन्य-चरितामृत", "है। संकर्षण के बाद वे प्रद्युम्न रूप में प्रकट होते हैं।"];
    expect(stripRunningHead(page)).toEqual(["है। संकर्षण के बाद वे प्रद्युम्न रूप में प्रकट होते हैं।"]);
  });

  it("drops the page number and the head under it — 276 of 1,160 pages carry both", () => {
    const page = ["८७", "श्लोक २ ] पूर्ण पुरुषोत्तम भगवान् श्री चैतन्य महाप्रभु", "वास्तविक पाठ यहाँ से आरम्भ होता है ।"];
    expect(stripRunningHead(page)).toEqual(["वास्तविक पाठ यहाँ से आरम्भ होता है ।"]);
  });

  it("stops after two lines, so a third head-looking line stays", () => {
    const page = ["xx श्रीचैतन्य-चरितामृत", "परिचय xxi", "xxii", "असली पाठ यहाँ से आरम्भ होता है ।"];
    expect(stripRunningHead(page)).toEqual(["xxii", "असली पाठ यहाँ से आरम्भ होता है ।"]);
  });


  it("takes the chapter title left under a broken head, but only after one", () => {
    // The scan breaks "श्लोक ७ ] गुरुवर्ग ७" across three lines
    expect(stripRunningHead(["श्लोक ७ ]", "", "गुरुवर्ग", "", "७", "", "वास्तविक पाठ"])).toEqual(["", "", "७", "", "वास्तविक पाठ"]);
  });

  it("leaves a bare title alone when no head came before it", () => {
    const page = ["गुरुवर्ग", "पाठ की पंक्ति"];
    expect(stripRunningHead(page)).toEqual(page);
  });

  it("leaves a short opening line alone when no page number follows it", () => {
    // Without the page number this is prose, not the rest of a head
    const page = ["२ श्रीचैतन्य-चरितामृत", "पहला अनुच्छेद", "", "दूसरा अनुच्छेद"];
    expect(stripRunningHead(page)).toEqual(["पहला अनुच्छेद", "", "दूसरा अनुच्छेद"]);
  });

  it("keeps a real opening line", () => {
    const page = ["अध्याय १", "श्री चैतन्य महाप्रभु की लीला", "और आगे का पाठ"];
    expect(stripRunningHead(page)).toEqual(page);
  });

  it("keeps a head-looking line further down the page, where it is a citation", () => {
    const page = ["वास्तविक पाठ यहाँ से आरम्भ होता है ।", "", "श्लोक १० ] यह उद्धरण है"];
    expect(stripRunningHead(page)).toEqual(page);
  });

  it("keeps the blank lines that mark paragraphs", () => {
    const page = ["२ श्रीचैतन्य-चरितामृत", "पहला अनुच्छेद", "", "दूसरा अनुच्छेद"];
    expect(stripRunningHead(page)).toEqual(["पहला अनुच्छेद", "", "दूसरा अनुच्छेद"]);
  });

  it("takes the page number off the foot of the page", () => {
    const page = ["पाठ की पहली पंक्ति", "पाठ की दूसरी पंक्ति", "xix"];
    expect(stripRunningHead(page)).toEqual(["पाठ की पहली पंक्ति", "पाठ की दूसरी पंक्ति"]);
    expect(stripRunningHead(["पाठ", "२४५"])).toEqual(["पाठ"]);
  });

  it("leaves a sentence at the foot of the page alone", () => {
    const page = ["पहली पंक्ति", "यह वाक्य पृष्ठ के अंत में है ।"];
    expect(stripRunningHead(page)).toEqual(page);
  });

  it("takes only one line off the foot", () => {
    const page = ["पाठ", "xix", "२४५"];
    expect(stripRunningHead(page)).toEqual(["पाठ", "xix"]);
  });

  it("leaves a page that is nothing but head rather than emptying it", () => {
    const page = ["xxxiv श्रीचैतन्य-चरितामृत"];
    expect(stripRunningHead(page)).toEqual(page);
  });

  it("handles an empty page and rubbish input", () => {
    expect(stripRunningHead([])).toEqual([]);
    expect(stripRunningHead(["", "  "])).toEqual(["", "  "]);
    expect(stripRunningHead(null as unknown as string[])).toEqual([]);
  });

  it("does not modify the array it was given", () => {
    const page = ["xxxiv श्रीचैतन्य-चरितामृत", "पाठ"];
    const copy = [...page];
    stripRunningHead(page);
    expect(page).toEqual(copy);
  });
});
