const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function mekongEyeScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.mekongeye.com/category/regions';

  try {
    console.log('Navigating to Mekong Eye Regions page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for post containers
    await page.waitForSelector('div.entry-container');
    console.log('Post containers found.');

    // Extract articles
    const articles = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('div.entry-container')).map(container => {
        const aTag = container.querySelector('h2.entry-title a[rel="bookmark"]');
        const timeTag = container.querySelector('span.posted-on time.entry-date.published');

        if (!aTag) return null;

        return {
          title: aTag.textContent.trim(),
          url: aTag.href,
          date: timeTag ? timeTag.getAttribute('datetime') : 'Date not found'
        };
      }).filter(Boolean);
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    const limitedArticles = articles.slice(0, 10);
    const filename = 'mekongEye.json';
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

mekongEyeScraper();
