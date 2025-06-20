const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function asicNewsroomScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://asic.gov.au/newsroom';

  try {
    console.log('Navigating to ASIC Newsroom page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for the article list items
    await page.waitForSelector('li[style="display: grid;"]', { timeout: 15000 });
    console.log('Article containers found.');

    // Scrape articles
    const articles = await page.evaluate(() => {
      const articleNodes = Array.from(document.querySelectorAll('li[style="display: grid;"]'));
      return articleNodes.map(article => {
        const linkEl = article.querySelector('h3 a');
        const title = linkEl ? linkEl.textContent.trim() : null;
        const url = linkEl ? linkEl.href : null;

        const dateEl = article.querySelector('p.nr-date');
        let date = dateEl ? dateEl.textContent.trim() : null;

        // Clean possible prefix like "Date: "
        if (date) {
          date = date.replace(/^Date:\s*/i, '');
        }

        return { title, url, date };
      }).filter(article => article.title && article.url);
    });

    if (articles.length === 0) {
      console.log('No articles found!');
      return;
    }

    // Limit to 10 results
    const limitedArticles = articles.slice(0, 10);

    // Save to JSON
    const filename = 'asicNewsroom.json';
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

asicNewsroomScraper();

//Does not work on its own, must scroll down and click "Load More"