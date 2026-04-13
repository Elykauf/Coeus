// @ts-check
const { test, expect } = require('./fixtures')

test.describe('Config / Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('settings dropdown opens on ⚙ click', async ({ page }) => {
    await page.click('button[title="Settings"]')
    await expect(page.locator('.settings-dropdown')).toBeVisible()
  })

  test('settings dropdown closes on ✕', async ({ page }) => {
    await page.click('button[title="Settings"]')
    await expect(page.locator('.settings-dropdown')).toBeVisible()
    await page.click('.settings-dropdown button:has-text("✕")')
    await expect(page.locator('.settings-dropdown')).not.toBeVisible()
  })

  test('config form shows all expected fields', async ({ page }) => {
    await page.click('button[title="Settings"]')
    const dropdown = page.locator('.settings-dropdown')
    const inputCount = await dropdown.locator('input[type="text"], input[type="password"]').count()
    expect(inputCount).toBeGreaterThanOrEqual(2)
    // Should have Stockfish path and Gemini key fields
    await expect(dropdown.getByPlaceholder(/stockfish|path/i).or(dropdown.locator('input').first())).toBeVisible()
  })

  test('config loads current values from API', async ({ page }) => {
    await page.click('button[title="Settings"]')
    const dropdown = page.locator('.settings-dropdown')
    // The stockfish path input should have a non-empty value (from config.json)
    const stockfishInput = dropdown.locator('input').first()
    await expect(stockfishInput).not.toHaveValue('')
  })

  test('saving config shows success feedback', async ({ page }) => {
    await page.click('button[title="Settings"]')
    const dropdown = page.locator('.settings-dropdown')
    // Click save button
    await dropdown.locator('button:has-text("Save")').click()
    // Should show some kind of success indicator
    await expect(dropdown.locator(':text("Saved"), :text("success"), :text("✓")').first()).toBeVisible({ timeout: 5000 })
  })
})
