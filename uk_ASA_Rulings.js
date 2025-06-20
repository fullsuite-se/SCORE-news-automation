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
    const url = 'https://www.asa.org.uk/codes-and-rulings/rulings.html?q=environmental+claims&sort_order=recent&from_date=&to_date=';

    console.log('Navigating to ASA Rulings...');
    await page.goto(url, { waitUntil: 'domingloaded', timeout: 60000 });

    // Wait for ruling items to load
    await page.waitForSelector('li.icon-listing-item', { timeout: 15000 });

    const articles = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('li.icon-listing-item'));
      return items.slice(0, 10).map(item => {
        const linkEl = item.querySelector('a');
        const titleEl = item.querySelector('h4.heading');

        const metaSpans = item.querySelectorAll('ul.meta-listing > li > span');
        const date = metaSpans.length >= 3 ? metaSpans[2].textContent.trim() : 'N/A';

        const url = linkEl ? linkEl.href : null;
        const title = titleEl ? titleEl.textContent.trim() : null;

        return { title, url, date };
      }).filter(article => article.title && article.url);
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