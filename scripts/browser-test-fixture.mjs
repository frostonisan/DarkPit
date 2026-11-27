// These scenarios construct their own board or Codex. The real starter screen
// is tested separately and must not intercept input intended for that fixture.
export async function dismissStarterForFixture(page) {
  await page.locator('#game-container').waitFor({ state: 'attached' });
  await page.evaluate(() => {
    document.querySelectorAll('.entitylootContainer').forEach(node => node.remove());
    // A delayed world-map banner can arrive after the starter is dismissed.
    // These tests own their Codex mount; startup banners are covered elsewhere.
    const style = document.createElement('style');
    style.dataset.browserTestFixture = 'starter-hidden';
    style.textContent = '#game-windows { display: none !important; }';
    document.head.append(style);
  });
}
