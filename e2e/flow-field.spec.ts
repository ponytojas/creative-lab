import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'three-colors.png')
const engineSelect = (page: Page) => page.getByRole('combobox', { name: 'Engine' })
const value = (page: Page, label: string) => page.getByRole('spinbutton', { name: `${label} value` })

async function setValue(page: Page, label: string, v: string) {
  await value(page, label).fill(v)
  await value(page, label).press('Enter')
}

test('switching engines remembers each engine’s parameters', async ({ page }) => {
  await page.goto('/')
  await setValue(page, 'Rings', '12')
  await engineSelect(page).selectOption({ label: 'Flow Field' })
  await expect(page.getByRole('heading', { name: 'Flow Field' })).toBeVisible()
  await setValue(page, 'Lines', '200')

  await engineSelect(page).selectOption({ label: 'Radial Fields' })
  await expect(value(page, 'Rings')).toHaveValue('12')
  await engineSelect(page).selectOption({ label: 'Flow Field' })
  await expect(value(page, 'Lines')).toHaveValue('200')
})

test('image influence needs an image palette; with one, the composition saves and reopens exactly', async ({ page }) => {
  await page.goto('/')
  await engineSelect(page).selectOption({ label: 'Flow Field' })
  await expect(value(page, 'Image influence')).toBeDisabled()
  await expect(page.getByText('Image influence needs a palette from Visual DNA')).toBeVisible()

  await page.getByRole('button', { name: 'Explore' }).click()
  await page.getByRole('button', { name: /Visual DNA/ }).click()
  await page.getByLabel('Import image').setInputFiles(FIXTURE)
  await page.getByRole('button', { name: 'Use in Atelier' }).click()

  await expect(page.getByRole('heading', { name: 'Flow Field' })).toBeVisible()
  await expect(value(page, 'Image influence')).toBeEnabled()
  await setValue(page, 'Image influence', '1')
  const artwork = page.getByRole('img', { name: /Flow Field artwork/ })
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved as “Flow Field #1”')).toBeVisible()
  const savedSvg = await artwork.innerHTML()

  await page.reload()
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByRole('heading', { name: 'Radial Fields' })).toBeVisible()
  await page.getByRole('button', { name: 'Saved' }).click()
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page.getByRole('heading', { name: 'Flow Field' })).toBeVisible()
  await expect(value(page, 'Image influence')).toHaveValue('1')
  await expect.poll(() => artwork.innerHTML()).toBe(savedSvg)
})
