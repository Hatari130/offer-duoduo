import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://127.0.0.1:5180/job-discovery.html');
  await page.waitForLoadState('networkidle');

  const title = await page.title();
  console.log('Page title:', title);

  // Check company options
  const companyOptions = await page.$$eval('select[aria-label="公司"] option', opts => opts.map(o => o.textContent.trim()));
  console.log('Company options:', companyOptions);

  // Select 顺丰
  await page.selectOption('select[aria-label="公司"]', '顺丰');
  await page.waitForTimeout(500);

  // Check job count
  const jobCount = await page.$eval('.list-toolbar strong', el => el.textContent.trim());
  console.log('顺丰 job count in UI:', jobCount);

  // Get first job card text
  const firstCardTitle = await page.$eval('.job-card h2', el => el.textContent.trim());
  const firstCardCompany = await page.$eval('.job-card .card-company', el => el.textContent.trim());
  const firstCardType = await page.$eval('.job-card .card-type', el => el.textContent.trim());
  const firstCardPublished = await page.$eval('.job-card .card-published', el => el.textContent.trim());
  console.log('First card info:', { firstCardCompany, firstCardTitle, firstCardType, firstCardPublished });

  // Check detail facts
  const facts = await page.$$eval('.job-facts .fact', els => els.map(e => ({
    label: e.querySelector('span')?.textContent.trim(),
    value: e.querySelector('strong')?.textContent.trim()
  })));
  console.log('Job detail facts:', facts);

  // Take desktop screenshot
  await page.screenshot({ path: 'outputs/sf-express-campus-2026-09-15/preview-sf-desktop.png' });
  console.log('Saved preview-sf-desktop.png');

  // Test mobile view
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'outputs/sf-express-campus-2026-09-15/preview-sf-mobile.png' });
  console.log('Saved preview-sf-mobile.png');

  await browser.close();
  console.log('UI verification completed successfully!');
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
