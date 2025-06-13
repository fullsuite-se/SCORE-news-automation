const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function asicScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  const url = 'https://asic.gov.au/newsroom';

  try {
    console.log('Navigating to ASIC Newsroom page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Click "Load More" once
    const loadMoreButton = await page.$('#btnLoadMore');
    if (loadMoreButton) {
      console.log('Clicking Load More button (1/1)...');
      await loadMoreButton.click();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for content to load
    }

    // Wait for articles to load
    await page.waitForSelector('li[style*="display: grid;"] h3 a');
    console.log('Post containers found.');

    const articles = await page.evaluate(() => {
      const seen = new Set();

      return Array.from(document.querySelectorAll('li[style*="display: grid;"]')).map(li => {
        const aTag = li.querySelector('h3 a');
        const dateEl = li.querySelector('div.nh-list-info p.nr-date');

        if (!aTag || seen.has(aTag.href)) return null;
        seen.add(aTag.href);

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

    const filename = 'asic.json';
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

asicScraper();
