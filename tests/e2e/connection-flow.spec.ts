import { expect, test, type Page } from '@playwright/test'

const authA = process.env.OUTKIN_E2E_AUTH_A ?? 'playwright/.auth/user-a.json'
const authB = process.env.OUTKIN_E2E_AUTH_B ?? 'playwright/.auth/user-b.json'
const usernameA = process.env.OUTKIN_E2E_USERNAME_A ?? ''
const usernameB = process.env.OUTKIN_E2E_USERNAME_B ?? ''
const displayNameA = process.env.OUTKIN_E2E_NAME_A ?? ''
const displayNameB = process.env.OUTKIN_E2E_NAME_B ?? ''

async function openDashboard(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /^Welcome,/ })).toBeVisible({ timeout: 20_000 })
}

async function ensureDiscoverable(page: Page) {
  const restore = page.getByRole('button', { name: 'Show in Discover again' })
  if (await restore.isVisible().catch(() => false)) {
    await restore.click()
    await expect(page.getByText('Visible to new matches')).toBeVisible()
  }
}

async function openConnections(page: Page) {
  await openDashboard(page)
  await page.getByRole('button', { name: /Pen pals (and|&) requests/i }).click()
  await expect(page.getByRole('heading', { name: 'Incoming requests' })).toBeVisible()
}

test.describe('two-account request and letter journey', () => {
  test.skip(
    process.env.OUTKIN_E2E_MUTATING !== '1',
    'Set OUTKIN_E2E_MUTATING=1 to allow this test to create a request and two letters.',
  )
  test.skip(
    !usernameA || !usernameB || !displayNameA || !displayNameB,
    'Set the OUTKIN_E2E_USERNAME_A/B and OUTKIN_E2E_NAME_A/B variables.',
  )

  test('request, accept, send, receive, and reply', async ({ browser }) => {
    const contextA = await browser.newContext({ storageState: authA })
    const contextB = await browser.newContext({ storageState: authB })
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()
    const stamp = new Date().toISOString()
    const firstLetter = `Automated smoke letter from ${displayNameB}. Run: ${stamp}`
    const reply = `Automated smoke reply from ${displayNameA}. Run: ${stamp}`

    try {
      await openDashboard(pageA)
      await openDashboard(pageB)
      await ensureDiscoverable(pageA)
      await ensureDiscoverable(pageB)

      await pageA.getByRole('button', { name: 'Discover matches' }).click()
      await expect(pageA.getByRole('heading', { name: 'People worth writing to.' })).toBeVisible()

      const cardB = pageA.locator('article.match-card').filter({ hasText: `@${usernameB}` })
      await expect(cardB, `@${usernameB} must be eligible and visible to account A`).toBeVisible({ timeout: 20_000 })
      await cardB.getByRole('button', { name: 'Request pen pal' }).click()
      await cardB.getByRole('textbox').fill(`Hi ${displayNameB}, this is an automated OutKin launch smoke test.`)
      await cardB.getByRole('button', { name: 'Send request' }).click()
      await expect(cardB.getByText('Request sent')).toBeVisible()

      await openConnections(pageB)
      const incomingSection = pageB.locator('section.connection-section').filter({
        has: pageB.getByRole('heading', { name: 'Incoming requests' }),
      })
      const incomingA = incomingSection.locator('article.connection-item').filter({ hasText: `@${usernameA}` })
      await expect(incomingA).toBeVisible()
      await incomingA.getByRole('button', { name: 'Accept' }).click()

      const activeSectionB = pageB.locator('section.active-penpals-section')
      const activeA = activeSectionB.locator('article.connection-item').filter({ hasText: `@${usernameA}` })
      await expect(activeA).toBeVisible()
      await activeA.getByRole('button', { name: 'Write a letter' }).click()
      await pageB.getByLabel('Subject').fill(`OutKin smoke ${stamp}`)
      await pageB.getByLabel('Your letter').fill(firstLetter)
      await pageB.getByRole('button', { name: 'Send letter' }).click()
      await expect(pageB.locator('.correspondence-status')).toContainText(`Your letter to ${displayNameA} was sent.`)

      await openConnections(pageA)
      const activeSectionA = pageA.locator('section.active-penpals-section')
      const activeB = activeSectionA.locator('article.connection-item').filter({ hasText: `@${usernameB}` })
      await expect(activeB).toContainText('1 new letter')
      await activeB.getByRole('button', { name: 'Write a letter' }).click()
      await expect(pageA.getByText(firstLetter)).toBeVisible()
      await pageA.getByLabel('Your letter').fill(reply)
      await pageA.getByRole('button', { name: 'Send letter' }).click()
      await expect(pageA.locator('.correspondence-status')).toContainText(`Your letter to ${displayNameB} was sent.`)

      await openConnections(pageB)
      await activeSectionB.locator('article.connection-item').filter({ hasText: `@${usernameA}` })
        .getByRole('button', { name: 'Write a letter' }).click()
      await expect(pageB.getByText(reply)).toBeVisible()
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })
})
