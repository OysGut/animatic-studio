/**
 * R7: verktøylinjer med overflow="menu" flytter grupper som ikke får plass, inn i «Mer …» (U2). Ved 1280 px
 * ligger for eksempel bibliotekets handlinger der. Åpner «Mer …» når elementet ikke er synlig i linjen.
 */
export async function revealInToolbar(page, locator, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await locator.isVisible().catch(() => false)) return locator;
    const more = page.getByTestId("toolbar-more").first();
    if (await more.isVisible().catch(() => false)) {
      await more.click();
      if (await locator.waitFor({ state: "visible", timeout: 2000 }).then(() => true, () => false)) return locator;
    }
    await page.waitForTimeout(200);
  }
  throw new Error("revealInToolbar: elementet ble ikke synlig");
}
