const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function iisdScraper() {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
  );

  const baseUrl = 'https://enb.iisd.org';
  const url = `${baseUrl}/archives`;

  try {
    console.log(' Opening IISD ENB Archives...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const articleLinks = await page.evaluate(() => {
      const containers = document.querySelectorAll('div.views-row');
      const results = [];

      containers.forEach(container => {
        const link = container.querySelector('h3.c-list-item__heading > a.c-list-item__heading-link');
        if (link && link.href) {
          results.push(link.href);
        }
      });

      return results;
    });

    console.log(` Found ${articleLinks.length} articles. Fetching titles...`);
    const articles = [];

    for (const link of articleLinks) {
      try {
        const articlePage = await browser.newPage();
        await articlePage.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        );

        await articlePage.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const title = await articlePage.title();

        if (title.trim() === 'Just a moment...') {
          console.warn(`  Skipped Cloudflare page: ${link}`);
        } else {
          articles.push({
            title: title.trim(),
            url: link
          });
        }

        await articlePage.close();
        await new Promise(res => setTimeout(res, 500)); // polite delay
      } catch (err) {
        console.warn(` Failed to fetch title for ${link}: ${err.message}`);
      }
    }

    if (!articles.length) {
      console.warn(' No valid articles found!');
      return;
    }

    const filename = 'iisd-enb-archives.json';
    fs.writeFileSync(path.join(process.cwd(), filename), JSON.stringify(articles, null, 2), 'utf8');
    console.log(` JSON saved as ${filename}`);
  } catch (err) {
    console.error(' Error scraping:', err.message);
  } finally {
    await browser.close();
    console.log(' Browser closed.');
  }
}

iisdScraper();
