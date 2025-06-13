const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function politicoUkScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.politico.eu/section/energy-uk/';

  try {
    console.log('Navigating to Politico UK Energy section...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('div.card__content');
    console.log('Post containers found.');

    const articles = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('div.card__content')).map(container => {
        const aTag = container.querySelector('h2.card__title a');
        const dateEl = container.querySelector('div.date-time.card__date-time.after-title span.date-time__date');

        if (!aTag) return null;

        return {
          title: aTag.textContent.trim(),
          url: aTag.href,
          date: dateEl ? dateEl.textContent.trim() : 'Date not found'
        };
      }).filter(Boolean);
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    const limitedArticles = articles.slice(0, 10);
    const filename = 'politicoUk.json';
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

politicoUkScraper();
