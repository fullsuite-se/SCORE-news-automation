const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function metiPressScraper() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    slowMo: 50,
  });

  try {
    const page = await browser.newPage();
    const url = 'https://www.meti.go.jp/english/press/category_05.html';

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForTimeout(5000);  // wait extra 5 seconds for full load
    await page.waitForSelector('dl.date_sp.b-solid.mb10', { timeout: 10000 });


    const articles = await page.evaluate(() => {
      const articleNodes = document.querySelectorAll('dl.date_sp.b-solid.mb10');
      const seen = new Set();
      const results = [];

      articleNodes.forEach(dl => {
        const dt = dl.querySelector('dt');
        const dd = dl.querySelector('dd');
        if (!dt || !dd) return;

        const date = dt.textContent.trim();
        const a = dd.querySelector('a');
        if (!a) return;

        const title = a.textContent.trim();
        let url = a.getAttribute('href') || '';
        if (url && !url.startsWith('http')) {
          url = new URL(url, window.location.origin).href;
        }

        // Deduplicate by URL
        if (!seen.has(url)) {
          seen.add(url);
          results.push({ title, date, url });
        }
      });

      return results.slice(0, 10);
    });

    if (articles.length === 0) {
      console.warn('No articles found.');
    }

    const filename = 'metiPressArticles.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
    console.log(`\nJSON saved at: ${fullPath}`);

  } catch (err) {
    console.error('Scraping failed:', err.message);
  } finally {
    await browser.close();
  }
}

metiPressScraper(); //doesn't really work cuz it's another headless :pensive:
