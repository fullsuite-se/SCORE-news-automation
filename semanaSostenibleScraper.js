const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function semanaSostenibleScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  const baseUrl = 'https://www.semana.com';
  const url = `${baseUrl}/sostenible/`;

  try {
    console.log('Navigating to Semana Sostenible...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('div.card-body', { timeout: 15000 });
    console.log('Article containers found.');

    // Extract article URLs and titles
    const articles = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.card-body'));
      return cards.map(card => {
        const h2 = card.querySelector('h2.card-title.h2.semanaserif-extrabold, h2.card-title.h4');
        const aTag = h2 ? h2.querySelector('a[href]') : null;

        const url = aTag ? aTag.href : null;
        const title = aTag ? aTag.textContent.trim() : null;

        return { title, url };
      }).filter(article => article.title && article.url);
    });

    // Limit to 10 articles
    const limitedArticles = articles.slice(0, 10);

    // Now visit each article to get the date
    for (let article of limitedArticles) {
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const date = await articlePage.evaluate(() => {
          const dateContainer = document.querySelector('div.mb-5.text-xs.text-smoke-500');
          return dateContainer ? dateContainer.textContent.trim() : 'Date not found';
        });

        article.date = date;
        await articlePage.close();
      } catch (err) {
        console.error(`Failed to get date for article: ${article.url}`, err);
        article.date = 'Date not found';
      }
    }

    // Write to JSON
    const filename = 'semanaSostenible.json';
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

semanaSostenibleScraper();
