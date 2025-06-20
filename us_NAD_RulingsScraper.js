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
    const url = 'https://bbbprograms.org/search?searchTerm=environmental&sortresultsby=newest&page=0&mediaTypes=%2FEducation-and-Resources%2Fnewsroom%2FDescisions%2F&resultsTotal=0#National+Advertising+Division+%28NAD%29';

    console.log('Navigating to BBB Programs...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForSelector('div.site-search__results-items article header', { timeout: 15000 });

    const articles = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('div.site-search__results-items article header'));

      return headers.slice(0, 10).map(header => {
        const linkEl = header.querySelector('h3 a');
        const paraEl = header.querySelector('p');

        const title = linkEl ? linkEl.textContent.trim() : null;
        const url = linkEl ? linkEl.href : null;

        let date = 'N/A';
        if (paraEl) {
          const text = paraEl.textContent.trim();
          const match = text.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/);
          if (match && match[0]) {
            date = match[0];
          }
        }

        return { title, url, date };
      }).filter(item => item.title && item.url);
    });

    if (articles.length === 0) {
      console.log('No articles found.');
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