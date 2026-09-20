import { describe, it, expect } from "vitest";
import { describeFailure, describeThrown, reasonFromBody } from "./requestError";

// The bug these cover: `data?.error || res.statusText` showed "Regenerate failed:"
// with nothing after it, because statusText is always "" over HTTP/2 and a
// gateway failure carries no `error` key.

describe("reasonFromBody", () => {
  it("reads our own functions' shape", () => {
    expect(reasonFromBody({ error: "All image attempts failed" })).toBe("All image attempts failed");
  });

  it("reads the gateway's shape, which has message and code but no error", () => {
    // Arrange: what a 546 worker-limit kill actually returns.
    const body = { code: "WORKER_LIMIT", message: "Worker exceeded memory limit" };
    // Act / Assert
    expect(reasonFromBody(body)).toBe("Worker exceeded memory limit");
  });

  it("falls back to the code when that is all the body has", () => {
    expect(reasonFromBody({ code: "BOOT_ERROR" })).toBe("BOOT_ERROR");
  });

  it("looks one level into a nested error object", () => {
    expect(reasonFromBody({ error: { message: "Too many requests" } })).toBe("Too many requests");
  });

  it("reads a plain-text body", () => {
    expect(reasonFromBody("row not found")).toBe("row not found");
  });

  it("keeps only the first line of a multi-line body", () => {
    expect(reasonFromBody("upload failed\n  at Object.handler\n  at async run")).toBe("upload failed");
  });

  it("truncates a very long reason instead of filling the alert", () => {
    const reason = reasonFromBody("x".repeat(400));
    expect(reason).toHaveLength(301);
    expect(reason.endsWith("…")).toBe(true);
  });

  it("ignores an HTML error page, which tells the reader nothing", () => {
    expect(reasonFromBody("<!DOCTYPE html><title>504 Gateway Timeout</title>")).toBe("");
  });

  it("returns nothing for an empty body, whatever its shape", () => {
    expect(reasonFromBody({})).toBe("");
    expect(reasonFromBody("")).toBe("");
    expect(reasonFromBody("   ")).toBe("");
    expect(reasonFromBody(null)).toBe("");
    expect(reasonFromBody(undefined)).toBe("");
    expect(reasonFromBody({ error: "" })).toBe("");
  });
});

describe("describeFailure", () => {
  it("prefers the server's own words", () => {
    expect(describeFailure(502, { error: "Upload failed: bucket missing" })).toBe("Upload failed: bucket missing");
  });

  it("explains a 546 worker-limit kill, the empty-alert case", () => {
    // Arrange: body the page could not read at all.
    // Act
    const message = describeFailure(546, {});
    // Assert: a reason, the code, and what to do next.
    expect(message).toContain("HTTP 546");
    expect(message).toContain("several renders run at once");
    expect(message).toContain("Refresh");
  });

  it("explains the other statuses these pages hit", () => {
    expect(describeFailure(504, {})).toContain("took too long");
    expect(describeFailure(429, {})).toContain("too many requests at once");
    expect(describeFailure(409, {})).toContain("refresh");
    expect(describeFailure(401, {})).toContain("not authorised");
  });

  it("explains a 2xx that came back without a result", () => {
    // Arrange: an ok response whose body lacks the `ok` the caller checks.
    // Act / Assert
    expect(describeFailure(200, { book: "gita" })).toBe("the server answered without a result — refresh and look again.");
  });

  it("still names the status when the code has no note", () => {
    expect(describeFailure(418, {})).toBe("HTTP 418");
  });

  it("says so when there was no response at all", () => {
    expect(describeFailure(0, {})).toContain("never got a response");
  });

  it("never returns an empty string", () => {
    for (const status of [0, 200, 400, 429, 500, 546, 504, 999]) {
      expect(describeFailure(status, {}).trim().length).toBeGreaterThan(0);
      expect(describeFailure(status, undefined).trim().length).toBeGreaterThan(0);
    }
  });
});

describe("describeThrown", () => {
  it("uses an Error's message", () => {
    expect(describeThrown(new Error("boom"))).toBe("boom");
  });

  it("explains a fetch that never reached the server", () => {
    expect(describeThrown(new TypeError("Failed to fetch"))).toContain("could not reach the server");
  });

  it("handles a thrown non-Error", () => {
    expect(describeThrown("plain string")).toBe("plain string");
  });

  it("says something for an empty throw", () => {
    expect(describeThrown(new Error(""))).toContain("failed before the server answered");
    expect(describeThrown(undefined)).toContain("failed before the server answered");
  });
});
