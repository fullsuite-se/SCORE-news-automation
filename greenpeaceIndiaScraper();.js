const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function greenpeaceIndiaScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.greenpeace.org/india/en/press/';

  try {
    console.log('Navigating to Greenpeace India Press page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for article containers
    await page.waitForSelector('li.wp-block-post', { timeout: 15000 });
    console.log('Article containers found.');

    const articles = await page.evaluate(() => {
      const posts = Array.from(document.querySelectorAll('li.wp-block-post'));

      return posts.map(post => {
        const linkEl = post.querySelector('a[href][target="_self"]');
        const url = linkEl ? linkEl.href : null;

        const titleEl = post.querySelector('h4');
        const title = titleEl ? titleEl.textContent.trim() : null;

        const dateEl = post.querySelector('div.wp-block-post-date time');
        let date = null;
        if (dateEl && dateEl.getAttribute('datetime')) {
          date = dateEl.getAttribute('datetime').split('T')[0];
        }

        return { title, url, date };
      }).filter(article => article.title && article.url);
    });

    if (articles.length === 0) {
      console.log('No articles found!');
      return;
    }

    const limitedArticles = articles.slice(0, 10);

    const filename = 'greenpeaceIndia.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(limitedArticles, null, 2), 'utf8');

    console.log(`\n✅ JSON file saved at: ${fullPath}`);
    console.log('🔢 Number of articles saved:', limitedArticles.length);
  } catch (err) {
    console.error('❌ Error scraping:', err);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

greenpeaceIndiaScraper();
