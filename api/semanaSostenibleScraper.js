const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function semanaSostenibleScraper() {
  const browser = await puppeteer.launch({ headless: true, slowMo: 50 });
  const page = await browser.newPage();

  const baseUrl = 'https://www.semana.com';
  const url = `${baseUrl}/sostenible/`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('div.card-body', { timeout: 15000 });

    const rawArticles = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.card-body'));
      const seen = new Set();
      const results = [];

      cards.forEach(card => {
        const h2 = card.querySelector('h2.card-title.h2.semanaserif-extrabold, h2.card-title.h4');
        const aTag = h2 ? h2.querySelector('a[href]') : null;

        const url = aTag ? aTag.href.trim() : null;
        const title = aTag ? aTag.textContent.trim() : null;

        //deduplication
        const key = `${title}||${url}`;
        if (title && url && !seen.has(key)) {
          seen.add(key);
          results.push({ title, url });
        }
      });

      return results;
    });

    const results = [];

    for (const article of rawArticles) {
      if (results.length >= 10) break;

      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const date = await articlePage.evaluate(() => {
          const dateContainer = document.querySelector('div.mb-5.text-xs.text-smoke-500');
          return dateContainer ? dateContainer.textContent.trim() : null;
        });

        if (date) {
          results.push({ ...article, date });
        }

        await articlePage.close();
      } catch (err) {
        console.warn(`Skipping article due to error or missing date: ${article.url}`);
      }
    }

    if (!results.length) {
      console.warn('No valid articles with dates found.');
      return;
    }

    const filename = 'semanaSostenible.json';
    const fullPath = path.join(process.cwd(), filename);

    fs.writeFileSync(fullPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\nJSON file saved at: ${fullPath}`);
  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    await browser.close();
  }
}

semanaSostenibleScraper();
