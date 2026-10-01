import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'three-colors.png')

async function openVisualDna(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore' }).click()
  await page.getByRole('button', { name: /Visual DNA/ }).click()
}

async function importFixture(page: Page) {
  await page.getByLabel('Import image').setInputFiles(FIXTURE)
  await expect(page.getByRole('img', { name: 'three-colors', exact: true })).toBeVisible()
}

const swatches = (page: Page) => page.getByRole('region', { name: 'Palette' }).getByRole('listitem')

test('import → analyze → reload restores the image and its palette', async ({ page }) => {
  await openVisualDna(page)
  await importFixture(page)
  await expect(swatches(page)).toHaveText([/#ff0000\s*50\.0%/, /#ffff00\s*25\.0%/, /#0000ff\s*25\.0%/])
  const grid = page.getByRole('region', { name: 'Color grid' })
  await expect(grid.getByLabel('Brightest')).toHaveCount(1)
  await expect(grid.getByLabel('Darkest')).toHaveCount(1)

  await page.reload()
  await page.getByRole('button', { name: 'Explore' }).click()
  await page.getByRole('button', { name: /Visual DNA/ }).click()
  await expect(page.getByRole('img', { name: 'three-colors', exact: true })).toBeVisible()
  await expect(swatches(page)).toHaveCount(3)
})

test('use in Atelier → save → reopen keeps the extracted palette', async ({ page }) => {
  await openVisualDna(page)
  await importFixture(page)
  await page.getByRole('button', { name: 'Use in Atelier' }).click()

  const picker = page.getByRole('combobox', { name: 'Palette', exact: true })
  await expect(picker.locator('option:checked')).toHaveText('three-colors · 3 colors')
  const artwork = page.getByRole('img', { name: /Radial Fields artwork/ })
  await expect.poll(() => artwork.innerHTML()).toContain('stroke="#ff0000"')
  expect(await artwork.innerHTML()).not.toContain('#d1495b') // built-in palette gone

  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved as “Radial Fields #1”')).toBeVisible()
  const savedSvg = await artwork.innerHTML()

  await page.reload()
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(picker.locator('option:checked')).toHaveText('Built-in')
  await page.getByRole('button', { name: 'Saved' }).click()
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(picker.locator('option:checked')).toHaveText('three-colors · 3 colors')
  await expect.poll(() => artwork.innerHTML()).toBe(savedSvg)
})

test('an image whose palette is in a saved composition cannot be deleted', async ({ page }) => {
  await openVisualDna(page)
  await importFixture(page)
  await page.getByRole('button', { name: 'Use in Atelier' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved as “Radial Fields #1”')).toBeVisible()

  await page.getByRole('button', { name: 'Explore' }).click()
  await page.getByRole('button', { name: /Visual DNA/ }).click()
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete three-colors' }).click()
  await expect(page.getByRole('alert')).toContainText('Used by 1 saved composition: Radial Fields #1')

  // Remove the composition, then the image can go.
  await page.getByRole('button', { name: 'Saved' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Explore' }).click()
  await page.getByRole('button', { name: /Visual DNA/ }).click()
  await page.getByRole('button', { name: 'Delete three-colors' }).click()
  await expect(page.getByRole('region', { name: 'Imported images' })).toHaveCount(0)
})

test('a file that is not an image is rejected with an explanation', async ({ page }) => {
  await openVisualDna(page)
  await page.getByLabel('Import image').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') })
  await expect(page.getByRole('alert')).toHaveText('This is not a JPEG, PNG or WebP image, or the file is damaged.')
})
