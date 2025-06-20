import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export default async function handler(req, res) {
  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    const url = 'https://www.mekongeye.com/category/regions';

    console.log('Navigating to Mekong Eye...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for articles to appear
    await page.waitForSelector('div.entry-container', { timeout: 30000 });

    const articles = await page.evaluate(() => {
      const nodes = document.querySelectorAll('div.entry-container');
      const seen = new Set();
      const results = [];

      nodes.forEach(article => {
        const header = article.querySelector('header.entry-header');
        const meta = article.querySelector('div.entry-meta time.entry-date.published');

        const anchor = header?.querySelector('a[rel="bookmark"]');
        let url = anchor?.getAttribute('href')?.trim();
        const title = anchor?.textContent?.trim();

        const date = meta?.getAttribute('datetime') || meta?.textContent?.trim() || null;

        const uniqueKey = `${title}||${url}`;
        if (title && url && date && !seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          results.push({ title, url, date });
        }
      });

      console.log(`Found ${results.length} articles before slicing.`);
      return results.slice(0, 10);
    });

    if (articles.length === 0) {
      console.log('No articles found!');
      res.status(200).json({ message: 'No articles found' });
      return;
    }

    res.status(200).json(articles);
  } catch (err) {
    console.error('Scraping failed:', err.message);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}