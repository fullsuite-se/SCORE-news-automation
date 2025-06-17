const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function icpenScraper() {
  const browser = await puppeteer.launch({ headless: true, slowMo: 50 });
  const page = await browser.newPage();

  const url = 'https://icpen.org/news';

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('div.teaser-icon, div.field.field--name-news-title.field--type-ds.field--label-hidden.field__item', { timeout: 15000 });

    const articles = await page.evaluate(() => {
      const results = [];

      function getDateText(element) {
        const parent = element.closest('.views-row');
        if (!parent) return null;

        const dateDiv =
          parent.querySelector('div.field--spaced.date-author.field.field--name-news-item-submitted-by.field--type-ds.field--label-hidden.field__item') ||
          parent.querySelector('div.date-author.field.field--name-news-item-submitted-by.field--type-ds.field--label-hidden.field__item');

        return dateDiv ? dateDiv.textContent.trim() : null;
      }

      const teaserDivs = Array.from(document.querySelectorAll('div.teaser-icon'));
      teaserDivs.forEach(teaser => {
        const titleDiv = teaser.querySelector('div.text--snug.field.field--name-news-title.field--type-ds.field--label-hidden.field__item');
        if (!titleDiv) return;

        const h2 = titleDiv.querySelector('h2');
        if (!h2) return;

        const link = h2.querySelector('a');
        if (!link) return;

        const title = link.textContent.trim();
        const url = link.href;
        const date = getDateText(teaser) || 'Date not found';

        if (title && url) {
          results.push({ title, url, date });
        }
      });

      const fieldDivs = Array.from(document.querySelectorAll('div.field.field--name-news-title.field--type-ds.field--label-hidden.field__item'));
      fieldDivs.forEach(div => {
        const h2 = div.querySelector('h2');
        if (!h2) return;
        const link = h2.querySelector('a');
        if (!link) return;

        const title = link.textContent.trim();
        const url = link.href;
        const date = getDateText(div) || 'Date not found';

        if (title && url) {
          results.push({ title, url, date });
        }
      });

      // Deduplicate articles by URL
      const seen = new Set();
      return results.filter(article => {
        if (seen.has(article.url)) return false;
        seen.add(article.url);
        return true;
      });
    });

    if (!articles.length) {
      console.log('No articles found.');
      return;
    }

    // Limit to 10 articles
    const limitedArticles = articles.slice(0, 10);

    // Write JSON
    const filename = 'ICPEN.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(limitedArticles, null, 2), 'utf8');
    console.log(`\n JSON saved at: ${fullPath}`);

  } catch (err) {
    console.error('Error scraping:', err.message);
  } finally {
    await browser.close();
  }
}

icpenScraper();
