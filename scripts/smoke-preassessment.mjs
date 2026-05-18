import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const recordId = process.env.SCORING_SMOKE_RECORD_ID || "cemros-block-2026-04-16";
const apiBase = process.env.SCORING_API_BASE_URL || "http://127.0.0.1:4100";
const appBase = process.env.SCORING_APP_BASE_URL || "http://127.0.0.1:5173";
const desktopShot = "tmp/preassessment-desktop.png";
const mobileShot = "tmp/preassessment-mobile.png";
const riskBaseUrl = "https://docs.google.com/spreadsheets/d/1vRWazbT1FUDv6o4Sq208-_pC7cdxptJBy2PoZyc27sY/edit?gid=423778694#gid=423778694";
const dataFile = new URL("../backend/data/coding-records.json", import.meta.url);
const smokeParameter = `Битрикс24 smoke ${Date.now()}`;

const rawDataSnapshot = await readFile(dataFile, "utf-8");
const original = await fetch(`${apiBase}/api/records/${encodeURIComponent(recordId)}`).then(assertOkJson);
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(`${appBase}/records/${encodeURIComponent(recordId)}`, { waitUntil: "networkidle" });
  const section = page.locator("#section-preassessment");
  await section.waitFor({ state: "visible", timeout: 15_000 });

  assert.ok(await section.getByText("Предоценка").count());
  assert.ok(await section.getByText("База рисков").count());
  assert.ok(await section.getByText("Решение Александра").count());
  assert.equal(await section.getByText("База рисков").getAttribute("href"), riskBaseUrl);
  assert.equal(await section.locator(".detail-preassessment-toolbar").count(), 0);

  const initialRowCount = await section.locator(".detail-preassessment-row").count();
  await section.getByRole("button", { name: "Добавить риск" }).click();
  const row = section.locator(".detail-preassessment-row").nth(initialRowCount);
  await row.locator("input").first().fill(smokeParameter);
  await row.locator("textarea").first().fill("Можно обойти типовым модулем и уточнением версии.");
  await row.locator(".detail-select-trigger").click();
  await selectOpenOption(page, "Не критично");

  const decisionSelects = section.locator(".detail-preassessment-summary .detail-select-trigger");
  assert.equal(await decisionSelects.count(), 2);
  await decisionSelects.nth(0).click();
  await selectOpenOption(page, "Оценка");
  await decisionSelects.nth(1).click();
  await selectOpenOption(page, "Не участвуем");
  await section.locator("input[type='url']").first().fill("https://example.com/estimate");

  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.getByText("Изменения сохранены.").waitFor({ state: "visible", timeout: 15_000 });

  const saved = await fetch(`${apiBase}/api/records/${encodeURIComponent(recordId)}`).then(assertOkJson);
  const savedSmokeRow = saved.preassessment.riskRows.find((riskRow) => riskRow.parameter === smokeParameter);
  assert.ok(savedSmokeRow);
  assert.equal(savedSmokeRow.criticality, "notCritical");
  assert.equal(saved.preassessment.summaryDecision, "estimate");
  assert.equal(saved.preassessment.alexanderDecision, "decline");

  await page.reload({ waitUntil: "networkidle" });
  const reloadedSection = page.locator("#section-preassessment");
  await reloadedSection.waitFor({ state: "visible", timeout: 15_000 });
  const reloadedRow = await findPreassessmentRowByParameter(reloadedSection, smokeParameter);
  assert.equal(await reloadedRow.locator("input").first().inputValue(), smokeParameter);
  assert.equal(await reloadedRow.locator("textarea").first().inputValue(), "Можно обойти типовым модулем и уточнением версии.");
  assert.ok(await reloadedRow.getByText("Не критично").count());
  assert.ok(await reloadedSection.getByText("Оценка").count());
  assert.ok(await reloadedSection.getByText("Не участвуем").count());
  await reloadedSection.screenshot({ path: desktopShot });

  await page.setViewportSize({ width: 390, height: 1100 });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#section-preassessment").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("#section-preassessment").screenshot({ path: mobileShot });
  await page.close();

  console.log("preassessment smoke passed");
  console.log(`desktop screenshot: ${desktopShot}`);
  console.log(`mobile screenshot: ${mobileShot}`);
} finally {
  await writeFile(dataFile, rawDataSnapshot, "utf-8");
  await browser.close();
}

async function assertOkJson(response) {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

async function selectOpenOption(page, label) {
  await page.locator(".detail-select-menu .detail-select-option", { hasText: label }).click();
}

async function findPreassessmentRowByParameter(section, parameter) {
  const rows = section.locator(".detail-preassessment-row");
  const count = await rows.count();

  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);

    if ((await row.locator("input").first().inputValue()) === parameter) {
      return row;
    }
  }

  throw new Error(`Preassessment row not found: ${parameter}`);
}
