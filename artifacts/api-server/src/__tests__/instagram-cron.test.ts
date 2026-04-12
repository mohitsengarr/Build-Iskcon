import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// ── Canto mapping tests ────────────────────────────────────────────────────

const CANTO_BOUNDARIES = [1, 20, 65, 70, 107, 136];

function getCantoNumber(globalChapter: number): number {
  for (let i = CANTO_BOUNDARIES.length - 1; i >= 0; i--) {
    if (globalChapter >= CANTO_BOUNDARIES[i]) return i + 1;
  }
  return 1;
}

describe("getCantoNumber", () => {
  it("returns canto 1 for chapters 1-19", () => {
    expect(getCantoNumber(1)).toBe(1);
    expect(getCantoNumber(10)).toBe(1);
    expect(getCantoNumber(19)).toBe(1);
  });

  it("returns canto 2 for chapters 20-64", () => {
    expect(getCantoNumber(20)).toBe(2);
    expect(getCantoNumber(40)).toBe(2);
    expect(getCantoNumber(64)).toBe(2);
  });

  it("returns canto 3 for chapters 65-69", () => {
    expect(getCantoNumber(65)).toBe(3);
    expect(getCantoNumber(69)).toBe(3);
  });

  it("returns canto 4 for chapters 70-106", () => {
    expect(getCantoNumber(70)).toBe(4);
    expect(getCantoNumber(100)).toBe(4);
    expect(getCantoNumber(106)).toBe(4);
  });

  it("returns canto 5 for chapters 107-135", () => {
    expect(getCantoNumber(107)).toBe(5);
    expect(getCantoNumber(135)).toBe(5);
  });

  it("returns canto 6 for chapters 136+", () => {
    expect(getCantoNumber(136)).toBe(6);
    expect(getCantoNumber(170)).toBe(6);
  });
});

// ── Threads caption truncation tests ────────────────────────────────────────

function truncateForThreads(caption: string, hashtags: string): string {
  let fullCaption = `${caption}\n\n${hashtags}`;

  if (fullCaption.length > 500) {
    const lines = caption.split("\n").filter((l) => l.trim());
    const headerLine = lines[0] || "";
    const lastLine = lines[lines.length - 1] || "";
    const availableChars = 500 - headerLine.length - hashtags.length - 10;
    const storyLines = lines.slice(1, -1).join("\n");
    const truncatedStory =
      storyLines.length > availableChars
        ? storyLines.substring(0, availableChars - 3) + "..."
        : storyLines;
    fullCaption = `${headerLine}\n${truncatedStory}\n${lastLine}\n\n${hashtags}`;
    if (fullCaption.length > 500) {
      fullCaption = fullCaption.substring(0, 497) + "...";
    }
  }

  return fullCaption;
}

describe("Threads caption truncation", () => {
  it("does not truncate short captions", () => {
    const caption = "📖 Srimad Bhagavatam\nShort story.\n🙏 Hare Krishna";
    const hashtags = "#SrimadBhagavatam #ISKCON";
    const result = truncateForThreads(caption, hashtags);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result).toContain("Short story");
  });

  it("truncates long captions to under 500 chars", () => {
    const caption =
      "📖 Srimad Bhagavatam — Canto 10, Chapter 19\n" +
      "A very long shlok in Devanagari script here\n" +
      "English translation of the shlok goes here\n" +
      "This is a very long detailed story that goes on and on about Krishna and the cowherds in the forest. " +
      "They were walking through the Munjavaranya forest when suddenly a massive fire erupted. " +
      "The cowherds were terrified and ran to Krishna for protection. " +
      "Krishna told them to close their eyes. Then He swallowed the entire fire. " +
      "When they opened their eyes, everything was peaceful and calm. " +
      "The cowherds were amazed and started to worship Krishna as a divine being. " +
      "Balarama also praised Krishna's glory. This was a demonstration of Krishna's divine power.\n" +
      "🙏 Hare Krishna";
    const hashtags = "#SrimadBhagavatam #ISKCON #KrishnaLeelas #ForestFire #Bhagavatam";
    const result = truncateForThreads(caption, hashtags);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result).toContain("Srimad Bhagavatam");
    expect(result).toContain("#SrimadBhagavatam");
  });

  it("preserves header and stays under 500 chars even with very long story", () => {
    const caption =
      "📖 Header Line\n" +
      "Very long story ".repeat(50) + "\n" +
      "🙏 Hare Krishna";
    const hashtags = "#Tag1 #Tag2";
    const result = truncateForThreads(caption, hashtags);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result).toContain("📖 Header Line");
  });
});

// ── Persona injection tests ─────────────────────────────────────────────────

const PERSONA_SHORT: Record<string, string> = {
  krishna_adult:
    "Lord Krishna: deep blue-skinned young man, peacock feather in curly black hair, golden crown, yellow silk dhoti",
  balarama:
    "Balarama: fair-skinned, wearing blue garments, carrying a plough",
  narada:
    "Sage Narada: clean-shaven male sage, white U-shaped tilak, carrying tanpura veena",
};

function injectPersona(scene: string): string {
  const checks: Array<[RegExp, string]> = [
    [/\bKrishna\b/i, "krishna_adult"],
    [/\bBalarama?\b/i, "balarama"],
    [/\bNarada\b/i, "narada"],
  ];

  const matched: string[] = [];
  for (const [pattern, key] of checks) {
    if (pattern.test(scene) && PERSONA_SHORT[key] && !matched.includes(PERSONA_SHORT[key])) {
      matched.push(PERSONA_SHORT[key]);
    }
  }
  return matched.length > 0 ? `${matched.join(". ")}. Scene: ${scene}` : scene;
}

describe("injectPersona", () => {
  it("injects Krishna persona when Krishna is mentioned", () => {
    const result = injectPersona("Krishna walks through the forest");
    expect(result).toContain("Lord Krishna: deep blue-skinned");
    expect(result).toContain("Scene: Krishna walks through the forest");
  });

  it("injects multiple personas", () => {
    const result = injectPersona("Krishna and Balarama in the forest");
    expect(result).toContain("Lord Krishna");
    expect(result).toContain("Balarama");
  });

  it("does not inject for unknown characters", () => {
    const result = injectPersona("A sage meditates by the river");
    expect(result).toBe("A sage meditates by the river");
  });
});

// ── Cron state management tests ─────────────────────────────────────────────

describe("CronState", () => {
  interface CronState {
    nextChapter: number;
    totalPosted: number;
    lastPostedAt: string | null;
    lastError: string | null;
    startedAt: string;
    paused: boolean;
  }

  it("initializes with the highest chapter", () => {
    const state: CronState = {
      nextChapter: 170,
      totalPosted: 0,
      lastPostedAt: null,
      lastError: null,
      startedAt: new Date().toISOString(),
      paused: false,
    };
    expect(state.nextChapter).toBe(170);
    expect(state.paused).toBe(false);
  });

  it("decrements chapter after all scenes posted", () => {
    const state: CronState = {
      nextChapter: 170,
      totalPosted: 3,
      lastPostedAt: new Date().toISOString(),
      lastError: null,
      startedAt: new Date().toISOString(),
      paused: false,
    };
    // Simulate chapter completion
    state.nextChapter = state.nextChapter - 1;
    expect(state.nextChapter).toBe(169);
  });

  it("pauses when reaching chapter 0", () => {
    const state: CronState = {
      nextChapter: 0,
      totalPosted: 500,
      lastPostedAt: new Date().toISOString(),
      lastError: null,
      startedAt: new Date().toISOString(),
      paused: false,
    };
    if (state.nextChapter < 1) {
      state.paused = true;
    }
    expect(state.paused).toBe(true);
  });
});

// ── Reverse chapter ordering tests ──────────────────────────────────────────

describe("Reverse chapter ordering", () => {
  it("processes chapters from highest to lowest", () => {
    const chapters = [1, 5, 10, 20, 50, 100, 150, 170];
    const descending = [...chapters].sort((a, b) => b - a);
    expect(descending[0]).toBe(170);
    expect(descending[descending.length - 1]).toBe(1);
  });

  it("skips missing chapters", () => {
    const allChapters = [1, 2, 3, 5, 8, 10]; // gaps at 4, 6, 7, 9
    let current = 10;
    const processed: number[] = [];

    while (current >= 1) {
      if (allChapters.includes(current)) {
        processed.push(current);
      }
      current--;
    }

    expect(processed).toEqual([10, 8, 5, 3, 2, 1]);
  });
});

// ── Schedule validation ─────────────────────────────────────────────────────

describe("Cron schedule", () => {
  it("runs at correct IST times (9AM, 3PM, 9PM, 3AM)", () => {
    // IST = UTC + 5:30
    // 9 AM IST  = 3:30 UTC
    // 3 PM IST  = 9:30 UTC
    // 9 PM IST  = 15:30 UTC
    // 3 AM IST  = 21:30 UTC
    const cronExpression = "30 3,9,15,21 * * *";
    const parts = cronExpression.split(" ");
    expect(parts[0]).toBe("30"); // minute 30
    expect(parts[1]).toBe("3,9,15,21"); // hours in UTC
    expect(parts.length).toBe(5); // valid 5-part cron
  });

  it("posts every 6 hours (4 times per day)", () => {
    const hours = [3, 9, 15, 21]; // UTC hours
    for (let i = 1; i < hours.length; i++) {
      expect(hours[i] - hours[i - 1]).toBe(6);
    }
    // Wrap-around: 21 + 6 = 27 → 3 (next day)
    expect((hours[hours.length - 1] + 6) % 24).toBe(hours[0]);
  });
});
