const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function politicoTechScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.politico.com/tech-news-updates-analysis';

  try {
    console.log('Navigating to Politico Tech page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('p.media-item__title a');
    console.log('Post containers found.');

    const articles = await page.evaluate(() => {
      const containers = Array.from(document.querySelectorAll('div.module.single-column-list'));
      const articleList = [];

      containers.forEach(container => {
        const links = container.querySelectorAll('p.media-item__title a');

        links.forEach(link => {
          const title = link.textContent.trim();
          const url = link.href;

          const mediaItem = link.closest('.media-item');
          const timeEl = mediaItem?.querySelector('div.meta__details p.authors time.meta__details__date');
          const date = timeEl ? timeEl.textContent.trim() : 'Date not found';

          articleList.push({ title, url, date });
        });
      });

      return articleList;
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    const limitedArticles = articles.slice(0, 10);

    const filename = 'politicoTechScraper.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(limitedArticles, null, 2), 'utf8');

    console.log(`\nJSON file saved at: ${fullPath}`);
    console.log('Number of articles saved:', limitedArticles.length);

  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

politicoTechScraper();
