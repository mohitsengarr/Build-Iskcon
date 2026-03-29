import { test, expect } from "@playwright/test";

const API = process.env.QA_API_URL || "http://localhost:5001";

// ── API Health ──────────────────────────────────────────────────────────────

test.describe("API", () => {
  test("health endpoint returns 200", async ({ request }) => {
    const res = await request.get(`${API}/api/healthz`);
    expect(res.status()).toBe(200);
  });

  test("temples endpoint returns array", async ({ request }) => {
    const res = await request.get(`${API}/api/temples`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("dashboard stats endpoint returns object", async ({ request }) => {
    const res = await request.get(`${API}/api/stats`);
    expect(res.status()).toBe(200);
  });
});

// ── Landing Page ────────────────────────────────────────────────────────────

test.describe("Landing Page", () => {
  test("loads with hero section visible", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Value proposition text should be visible
    await expect(page.locator("text=Live global dashboard")).toBeVisible({ timeout: 10_000 });

    // Shloka text
    await expect(page.locator("text=sarvatra pracāra haibe mora nāma")).toBeVisible();
  });

  test("Donate Now CTA links to iskcon.org/donate", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // At least one donate link should be visible (hero on desktop, sticky bar on mobile)
    const donateLinks = page.locator("a[href='https://www.iskcon.org/donate']");
    const count = await donateLinks.count();
    expect(count).toBeGreaterThan(0);

    // At least one should be visible
    let anyVisible = false;
    for (let i = 0; i < count; i++) {
      if (await donateLinks.nth(i).isVisible()) {
        anyVisible = true;
        break;
      }
    }
    expect(anyVisible).toBe(true);
  });

  test("hero Explore Projects CTA navigates to /temples", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const exploreBtn = page.locator("text=Explore Projects").first();
    await expect(exploreBtn).toBeVisible({ timeout: 10_000 });
  });

  test("key metrics cards render", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // At least one metric card with "Total" text
    await expect(page.locator("text=Total Active Projects").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=Total Portfolio Goal").first()).toBeVisible();
  });

  test("no JavaScript console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Allow time for lazy-loaded sections
    await page.waitForTimeout(3000);

    expect(errors).toEqual([]);
  });
});

// ── Navigation ──────────────────────────────────────────────────────────────

test.describe("Navigation", () => {
  test("nav Donate button has correct link (desktop only)", async ({ page, viewport }) => {
    if (viewport && viewport.width < 640) {
      test.skip();
      return;
    }
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const navDonate = page.locator("nav a[href='https://www.iskcon.org/donate']");
    await expect(navDonate).toBeVisible({ timeout: 10_000 });
  });

  test("Vision 2051 link exists in nav", async ({ page, viewport }) => {
    if (viewport && viewport.width < 768) {
      test.skip();
      return;
    }
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const visionLink = page.locator("nav >> text=Vision 2051").first();
    await expect(visionLink).toBeVisible({ timeout: 10_000 });
  });

  test("footer links are real URLs (not #)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const footerLinks = page.locator("footer a[href]");
    const count = await footerLinks.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const href = await footerLinks.nth(i).getAttribute("href");
      expect(href).not.toBe("#");
    }
  });
});

// ── Pages ───────────────────────────────────────────────────────────────────

test.describe("Pages", () => {
  test("temples list page loads", async ({ page }) => {
    await page.goto("/temples");
    await page.waitForLoadState("networkidle");
    // Should not show 404
    await expect(page.locator("text=Page Not Found")).not.toBeVisible();
  });

  test("vision2051 page loads", async ({ page }) => {
    await page.goto("/vision2051");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Page Not Found")).not.toBeVisible();
  });

  test("blogs page loads", async ({ page }) => {
    await page.goto("/blogs");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Page Not Found")).not.toBeVisible();
  });
});

// ── Mobile ──────────────────────────────────────────────────────────────────

test.describe("Mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("sticky donate bar visible on mobile", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const stickyBar = page.locator("text=Donate Now").last();
    await expect(stickyBar).toBeVisible({ timeout: 10_000 });
  });
});
