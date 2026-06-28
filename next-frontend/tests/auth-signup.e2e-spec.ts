import { expect, test } from "./fixtures"

// 1 spec → 1 file with one describe (feature = target_file stem) + N test() blocks.
// Upstream is faked server-side by mocks/ MSW via instrumentation.ts; per-scenario
// outcomes use the reserved trigger emails (conflict@ → 409, badrequest@ → 400).
// No page.route() of /api/** — that would short-circuit the real Route Handlers.
test.describe("auth-signup", () => {
  // 1. Register a new user with email and password

  test("1.1 signup-success-account-created", async ({ page }) => {
    await page.goto("/signup")

    const card = page.locator("[data-slot='card']")
    await expect(card).toBeVisible()
    await expect(page.getByLabel("Email address")).toBeVisible()
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible()
    const submit = page.getByRole("button", { name: "Create account" })
    await expect(submit).toBeVisible()

    await page.getByLabel("Full Name").fill("Alice Doe")
    await page.getByLabel("Email address").fill("alice@example.com")
    await page.getByLabel("Password", { exact: true }).fill("Password1")
    await page.getByLabel("Confirm Password").fill("Password1")
    await page.getByRole("checkbox").check()

    const signupRequest = page.waitForRequest(
      (r) => r.url().includes("/api/auth/signup") && r.method() === "POST"
    )
    await submit.click()
    await signupRequest

    await expect(page.getByRole("status")).toContainText("Account created!")
    // No session established, no redirect to an authenticated area.
    await expect(page).toHaveURL(/\/signup$/)
    const cookies = await page.context().cookies()
    expect(cookies.some((c) => c.name.includes("session"))).toBe(false)
  })

  test("1.2 signup-error-409-email-already-registered", async ({ page }) => {
    await page.goto("/signup")

    await page.getByLabel("Full Name").fill("Alice Doe")
    await page.getByLabel("Email address").fill("conflict@example.com")
    await page.getByLabel("Password", { exact: true }).fill("Password1")
    await page.getByLabel("Confirm Password").fill("Password1")
    await page.getByRole("checkbox").check()
    await page.getByRole("button", { name: "Create account" }).click()

    await expect(page.getByText(/already registered/i)).toBeVisible()
    const cta = page.getByRole("link", { name: /log in/i })
    await expect(cta).toHaveAttribute("href", "/login")

    // Correct to a fresh email that trips the 400 validation trigger.
    await page.getByLabel("Email address").fill("badrequest@example.com")
    await page.getByRole("button", { name: "Create account" }).click()

    const alert = page.locator("[data-slot='form-error']")
    await expect(alert).toContainText(/validation failed/i)
    await expect(
      page.getByRole("link", { name: /log in/i })
    ).toHaveCount(0)
  })

  test("1.3 signup-client-side-validation-blocks-submit", async ({ page }) => {
    await page.goto("/signup")

    const requests: string[] = []
    page.on("request", (r) => {
      if (r.url().includes("/api/auth/signup")) requests.push(r.method())
    })

    await page.getByRole("button", { name: "Create account" }).click()
    await expect(
      page.getByText("Invalid email address")
    ).toBeVisible()
    await expect(
      page.getByText("You must accept the terms")
    ).toBeVisible()
    expect(requests).toHaveLength(0)

    // Violate mirrored backend rules: malformed email + weak password, terms off.
    await page.getByLabel("Full Name").fill("Alice Doe")
    await page.getByLabel("Email address").fill("not-an-email")
    await page.getByLabel("Password", { exact: true }).fill("weak")
    await page.getByLabel("Confirm Password").fill("weak")
    await page.getByRole("button", { name: "Create account" }).click()
    await expect(
      page.getByText("Invalid email address")
    ).toBeVisible()
    expect(requests).toHaveLength(0)

    // Fix everything and accept terms → submit is released.
    await page.getByLabel("Email address").fill("alice@example.com")
    await page.getByLabel("Password", { exact: true }).fill("Password1")
    await page.getByLabel("Confirm Password").fill("Password1")
    await page.getByRole("checkbox").check()

    const signupRequest = page.waitForRequest(
      (r) => r.url().includes("/api/auth/signup") && r.method() === "POST"
    )
    await page.getByRole("button", { name: "Create account" }).click()
    await signupRequest
    expect(requests.length).toBeGreaterThan(0)
  })
})
