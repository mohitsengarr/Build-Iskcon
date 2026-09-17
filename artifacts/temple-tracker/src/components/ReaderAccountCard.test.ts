import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReaderAccountCard, ReaderAccountCardView } from "./ReaderAccountCard";

// The sidebar's reader card. Sign out is a labelled button that asks first; the
// old bare X signed out on one click. Rendered to static markup (the test
// environment is node, no DOM), so each state is rendered through the view.

const noop = () => {};
const EMAIL = "reader@example.com";

function view(overrides: Partial<Parameters<typeof ReaderAccountCardView>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(ReaderAccountCardView, {
      readerId: EMAIL,
      readerName: null,
      confirming: false,
      onLogin: noop,
      onAskSignOut: noop,
      onCancelSignOut: noop,
      onConfirmSignOut: noop,
      ...overrides,
    }),
  );
}

/** The visible text of each <button>, in order. */
function buttons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
}

describe("ReaderAccountCardView", () => {
  it("offers sign-in when no reader is signed in", () => {
    // Arrange / Act
    const html = view({ readerId: null });
    // Assert
    expect(buttons(html)).toEqual(["Sign in to save bookmarks"]);
  });

  it("shows the signed-in reader with a labelled Sign out button, not an icon alone", () => {
    const html = view();
    expect(html).toContain(EMAIL);
    expect(html).toContain("Signed in");
    expect(buttons(html)).toEqual(["Sign out"]);
  });

  it("shows the reader's name, and their initial, when one was given", () => {
    const html = view({ readerName: "Mohit" });
    expect(html).toContain("Mohit");
    expect(html).not.toContain("Signed in");
    expect(html).toMatch(/>M</);
  });

  it("uses the email's first letter, upper-cased, when there is no name", () => {
    expect(view({ readerId: "govinda@example.com" })).toMatch(/>G</);
  });

  it("does not ask anything until Sign out is pressed", () => {
    const html = view();
    expect(html).not.toContain("alertdialog");
    expect(html).not.toContain("Cancel");
  });

  it("asks before signing out, naming the account, with Cancel first and focused", () => {
    // Arrange / Act
    const html = view({ confirming: true });
    // Assert
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain(`Sign out of ${EMAIL}?`);
    expect(buttons(html)).toEqual(["Cancel", "Sign out"]);
    // React renders autoFocus as no attribute in static markup, so the order is what
    // the markup can prove: Cancel is the first control in the dialog.
    const dialog = html.slice(html.indexOf("alertdialog"));
    expect(dialog.indexOf("Cancel")).toBeLessThan(dialog.indexOf("Sign out</button>"));
  });

  it("keeps the reader's identity visible while it asks", () => {
    const html = view({ confirming: true, readerName: "Mohit" });
    expect(html).toContain("Mohit");
    expect(html).toContain(EMAIL);
  });
});

describe("ReaderAccountCard", () => {
  it("starts on the plain card, never on the question", () => {
    const html = renderToStaticMarkup(
      createElement(ReaderAccountCard, { readerId: EMAIL, readerName: null, onLogin: noop, onLogout: noop }),
    );
    expect(buttons(html)).toEqual(["Sign out"]);
    expect(html).not.toContain("alertdialog");
  });

  it("renders the sign-in button when signed out", () => {
    const html = renderToStaticMarkup(
      createElement(ReaderAccountCard, { readerId: null, readerName: null, onLogin: noop, onLogout: noop }),
    );
    expect(buttons(html)).toEqual(["Sign in to save bookmarks"]);
  });
});
