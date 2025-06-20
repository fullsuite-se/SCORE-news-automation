import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    const url = 'https://www.asa.org.uk/advice-and-resources/news.html';

    console.log('Navigating to ASA News...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for articles to appear
    await page.waitForSelector('li.listing-item.news-item', { timeout: 15000 });

    const articles = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('li.listing-item.news-item'));
      return items.slice(0, 10).map(item => {
        const linkEl = item.querySelector('a.listing-item-wrapper');
        const titleEl = item.querySelector('h3.heading');
        const metaListItems = item.querySelectorAll('ul.meta-listing > li');

        const url = linkEl ? linkEl.href : null;
        const title = titleEl ? titleEl.textContent.trim() : null;
        const date = metaListItems.length > 1 ? metaListItems[1].textContent.trim() : 'N/A';

        return { title, url, date };
      }).filter(article => article.title && article.url);
    });

    if (articles.length === 0) {
      res.status(404).json({ message: 'No articles found' });
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(articles);
  } catch (err) {
    console.error('Scraping failed:', err.message);
    res.status(500).json({ message: 'Scraping failed' });
  }
}