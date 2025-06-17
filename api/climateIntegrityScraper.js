const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function climateIntegrityScraper() {
  const browser = await puppeteer.launch({
    headless: true,
    slowMo: 50,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://climateintegrity.org/news/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await page.waitForSelector('div.col-md.pt-4.slider-block__column', { timeout: 30000 });

    const articles = await page.evaluate(() => {
      const articleNodes = document.querySelectorAll('div.col-md.pt-4.slider-block__column');
      const results = [];
      const seen = new Set();

      articleNodes.forEach(node => {
        const linkEl = node.querySelector('h5.text--p2.mb-0 a');
        const spanTitle = linkEl?.querySelector('span');
        const dateEl = node.querySelector('span.text--metadata.d-block.mb-3');

        const title = spanTitle?.textContent.trim() || '';
        const relativeUrl = linkEl?.getAttribute('href') || '';
        const url = relativeUrl ? new URL(relativeUrl, 'https://climateintegrity.org').href : '';
        const date = dateEl?.textContent.trim() || '';

        //deduplication
        if (title && url && date && !seen.has(url)) {
          seen.add(url);
          results.push({ title, url, date });
        }
      });

      return results.slice(0, 10); // limit to 10 articles
    });

    if (articles.length === 0) {
      console.warn('No articles found.');
    } else {
      const filename = 'climateIntegrityArticles.json';
      const fullPath = path.join(process.cwd(), filename);
      fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
      console.log(`\n JSON saved at: ${fullPath}`);
    }

  } catch (error) {
    console.error('Error during scraping:', error.message);
  } finally {
    await browser.close();
  }
}

climateIntegrityScraper();
