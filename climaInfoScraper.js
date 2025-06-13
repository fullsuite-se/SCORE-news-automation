const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function climaInfoScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const baseUrl = 'https://climainfo.org.br';
  const url = `${baseUrl}/noticias/`;

  try {
    console.log('Navigating to ClimaInfo News page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for posts to load
    await page.waitForSelector('h3.brxe-vzxxxz.brxe-heading.feed_post__title');
    console.log('Post containers found.');

    // Extract article URLs and titles
    const articles = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h3.brxe-vzxxxz.brxe-heading.feed_post__title')).map(el => {
        const aTag = el.querySelector('a[href]');
        if (!aTag) return null;
        return {
          title: aTag.textContent.trim(),
          url: aTag.href
        };
      }).filter(Boolean);
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    // Limit to 10 articles
    const limitedArticles = articles.slice(0, 10);

    // Save to JSON
    const filename = 'climainfo.json';
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

climaInfoScraper();
