import { expect, test, type Page } from '@playwright/test'

const artwork = (page: Page) => page.getByRole('img', { name: /Radial Fields artwork/ })
const rings = (page: Page) => page.getByRole('spinbutton', { name: 'Rings value' })

async function setRings(page: Page, value: string) {
  await rings(page).fill(value)
  await rings(page).press('Enter')
}

test('generate → save → reload → reopen restores the exact artwork', async ({ page }) => {
  await page.goto('/')
  await setRings(page, '12')
  await page.getByRole('textbox', { name: 'Seed' }).fill('777')
  await expect(artwork(page)).toHaveAttribute('aria-label', /seed 777/)

  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved as “Radial Fields #1”')).toBeVisible()
  const savedSvg = await artwork(page).innerHTML()

  await page.reload()
  await expect(page.getByRole('region', { name: 'Session recovery' })).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(rings(page)).toHaveValue('32') // fresh defaults

  await page.getByRole('button', { name: 'Saved' }).click()
  const thumbnail = page.getByRole('img', { name: 'Radial Fields #1' })
  await expect(thumbnail).toBeVisible()
  expect(await thumbnail.evaluate((img) => (img as { naturalWidth: number }).naturalWidth)).toBe(400)

  await page.getByRole('button', { name: 'Open' }).click()
  await expect(rings(page)).toHaveValue('12')
  await expect(page.getByRole('textbox', { name: 'Seed' })).toHaveValue('777')
  await expect.poll(() => artwork(page).innerHTML()).toBe(savedSvg)
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
})

test('unsaved work survives a reload through draft recovery', async ({ page }) => {
  await page.goto('/')
  await setRings(page, '20')
  await expect(page.getByText('Autosaving…')).toBeVisible()
  await expect(page.getByText('Autosaved locally')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Restore' }).click()
  await expect(rings(page)).toHaveValue('20')
  await expect(page.getByText('Not saved yet')).toBeVisible()
})

test('opening a saved item over unsaved work asks first', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved as “Radial Fields #1”')).toBeVisible()
  await setRings(page, '50')

  await page.getByRole('button', { name: 'Saved' }).click()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page.getByRole('button', { name: 'Open' })).toBeVisible() // still on Saved

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(rings(page)).toHaveValue('32')
})

test('rename and delete in Saved', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved as “Radial Fields #1”')).toBeVisible()
  await page.getByRole('button', { name: 'Saved' }).click()

  await page.getByRole('button', { name: 'Rename' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Bloom')
  await page.getByRole('textbox', { name: 'Name' }).press('Enter')
  await expect(page.getByText('Bloom')).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Nothing saved yet.')).toBeVisible()
})

test('a second tab is read-only', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  const second = await context.newPage()
  await second.goto('/')
  await expect(second.getByText('This tab is read-only.')).toBeVisible()
  await expect(second.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await expect(second.getByRole('spinbutton', { name: 'Rings value' })).toBeDisabled()
})
