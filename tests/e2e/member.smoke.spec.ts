import { expect, test } from '@playwright/test'

test('a signed-in member can reach the profile and photo controls', async ({ page }) => {
  await page.goto('/')

  const dashboardHeading = page.getByRole('heading', { name: /^Welcome,/ })
  const onboardingHeading = page.getByRole('heading', { name: 'Tell future friends a little about you.' })

  await expect(dashboardHeading.or(onboardingHeading)).toBeVisible()

  const legalGate = page.getByRole('dialog', {
    name: 'Please review the current rules before continuing.',
  })
  expect(
    await legalGate.isVisible().catch(() => false),
    'This saved session still needs to accept the current policies. Accept them once in the browser, then capture the session again.',
  ).toBeFalsy()

  const identityGate = page.getByRole('dialog', { name: 'Choose how we can identify your account.' })
  expect(
    await identityGate.isVisible().catch(() => false),
    'This member still needs a unique username. Complete identity setup once, then capture the session again.',
  ).toBeFalsy()

  if (await dashboardHeading.isVisible()) {
    await expect(page.getByRole('button', { name: 'Discover matches' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Pen pals (and|&) requests/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit profile' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Hide from Discover|Show in Discover again/ })).toBeVisible()
    await page.getByRole('button', { name: 'Edit profile' }).click()
  }

  await expect(page.getByRole('heading', { name: 'Basics' })).toBeVisible()
  await expect(page.getByLabel('Ongoing writing connections')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Show my profile in Discover.' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Save profile|Finish profile/ })).toBeVisible()

  const photoButton = page.getByRole('button', {
    name: /Add photo or set privacy|Change photo or privacy/,
  })
  await expect(photoButton).toBeVisible()
  await photoButton.click()

  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Who can see it?')).toBeVisible()
  await expect(page.getByRole('radio', { name: /Show in Discover/ })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Established connections/ })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Hidden/ })).toBeVisible()
})
