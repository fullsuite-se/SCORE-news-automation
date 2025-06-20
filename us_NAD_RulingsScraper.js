const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function us_NAD_RulingsScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  const url = 'https://bbbprograms.org/search?searchTerm=environmental&sortresultsby=newest&page=0&mediaTypes=%2FEducation-and-Resources%2Fnewsroom%2FDescisions%2F&resultsTotal=0#National+Advertising+Division+%28NAD%29';

  try {
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
      return;
    }

    const filename = 'us_nad_rulings.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
    console.log(`JSON file saved at: ${fullPath}`);
    console.log('Number of articles saved:', articles.length);
  } catch (err) {
    console.error('Scraping failed:', err.message);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

us_NAD_RulingsScraper();
