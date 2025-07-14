const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function politicoUkScraper() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null, // Added for consistency
    slowMo: 50,
  });

  const page = await browser.newPage();
  const baseUrl = 'https://www.politico.eu/section/energy-uk/'; // Renamed to baseUrl for consistency

  try {
    console.log(`Navigating to: ${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('Waiting for post containers...');
    await page.waitForSelector('div.card__content', { timeout: 60000 });
    console.log('Post containers found.');

    const articles = await page.evaluate(() => {
      const results = [];
      const newsItems = document.querySelectorAll('div.card__content'); // Renamed for consistency

      newsItems.forEach(container => {
        let title = null;
        let url = null;
        let date = null;

        const aTag = container.querySelector('h2.card__title a');
        const dateEl = container.querySelector('div.date-time.card__date-time.after-title span.date-time__date');

        if (aTag) {
          title = aTag.textContent.trim();
          // Ensure URL is absolute using window.location.origin for robustness
          url = new URL(aTag.getAttribute('href'), window.location.origin).href;
        }

        if (dateEl) {
          date = dateEl.textContent.trim();
        }

        // Only push if all essential data points are found
        if (title && url && date) {
          results.push({ title, url, date });
        }
      });

      return results.slice(0, 10); // Apply the 10-article limit
    });

    if (articles.length === 0) {
      console.log('No articles found on the page after scraping.');
      return; // Exit if no articles
    }

    const filePath = path.join(process.cwd(), 'politicoUk.json'); // Renamed filename for consistency
    fs.writeFileSync(filePath, JSON.stringify(articles, null, 2), 'utf8');

    console.log(`\nJSON saved to ${filePath}`);
    console.log(`Scraped ${articles.length} articles (limited to 10).`);

  } catch (err) {
    console.error('Scraping failed:', err.message);
    console.error(err); // Log full error object for detailed debugging
  } finally {
    console.log('Closing browser.');
    await browser.close();
  }
}

politicoUkScraper();