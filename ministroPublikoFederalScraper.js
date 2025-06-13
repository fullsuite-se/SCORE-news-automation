const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function ministroPublikoFederalScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.mpf.mp.br/sala-de-imprensa/noticias';

  try {
    console.log('Navigating to MPF News page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for articles to load
    await page.waitForSelector('article');
    console.log('Post containers found.');

    // Scrape the articles
    const articles = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('article')).map(article => {
        const h2 = article.querySelector('h2 a[href]');
        const title = h2 ? h2.textContent.trim() : null;
        const url = h2 ? h2.href : null;

        const dateSpan = article.querySelector('div.categoria span.data');
        const date = dateSpan ? dateSpan.textContent.trim() : 'Date not found';

        if (title && url) {
          return { title, url, date };
        }
        return null;
      }).filter(Boolean);
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    // Limit to 10 articles
    const limitedArticles = articles.slice(0, 10);

    // Save to JSON
    const filename = 'mpfNews.json';
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

ministroPublikoFederalScraper();
