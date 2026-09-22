import { expect, test } from '@playwright/test'

test.describe('public launch surface', () => {
  test('home page presents the OutKin promise and public actions', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/OutKin/)
    await expect(page.getByText('OutKin', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Find your people. Build your chosen family.' })).toBeVisible()
    await expect(page.getByText('LGBTQ+ people & allies welcome')).toBeVisible()
    await expect(page.getByText('Friendships worth writing for.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByText('Project PenPal', { exact: true })).toHaveCount(0)
  })

  test('signup requires current legal consent before submission', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('heading', { name: 'Create your account.' })).toBeVisible()
    const consent = page.getByRole('checkbox', {
      name: /I agree to the OutKin Terms of Service and Community Guidelines/i,
    })
    await expect(consent).toBeVisible()
    await expect(consent).not.toBeChecked()
    await expect(consent).toHaveAttribute('required', '')

    await page.getByRole('button', { name: 'Terms', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Legal & safety center.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible()
    await page.getByRole('button', { name: 'Close Legal and Safety Center' }).click()
  })

  test('About and PWA assets are branded and reachable', async ({ page, request }) => {
    await page.goto('/about.html')
    await expect(page).toHaveTitle(/OutKin/)
    await expect(page.getByText('OutKin', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Project PenPal', { exact: true })).toHaveCount(0)

    const manifestResponse = await request.get('/manifest.webmanifest')
    expect(manifestResponse.ok()).toBeTruthy()
    const manifest = await manifestResponse.json()
    expect(manifest.name).toContain('OutKin')
    expect(manifest.short_name).toContain('OutKin')

    const iconResponse = await request.get('/app-icon.svg')
    expect(iconResponse.ok()).toBeTruthy()
  })
})
