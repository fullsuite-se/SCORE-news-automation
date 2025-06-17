const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function apClimateScraper() {
  const browser = await puppeteer.launch({ headless: true, slowMo: 50 });
  const page = await browser.newPage();

  const url = 'https://apnews.com/climate-and-environment';

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('div.PagePromo-content', { timeout: 15000 });

    // Extract article URLs and titles from the listing page
    const articles = await page.evaluate(() => {
      const articleDivs = Array.from(document.querySelectorAll('div.PagePromo-content'));
      return articleDivs.map(div => {
        const linkEl = div.querySelector('a.Link');
        const titleEl = div.querySelector('span.PagePromoContentIcons-text');

        const url = linkEl?.href || null;
        const title = titleEl?.textContent.trim() || null;

        return { title, url };
      }).filter(article => article.title && article.url);

      // Deduplicate based on unique URLs
      const seen = new Set();
      return rawArticles.filter(article => {
        if (seen.has(article.url)) return false;
        seen.add(article.url);
        return true;
      });
      
    });

    if (articles.length === 0) {
      console.log('No articles found!');
      return;
    }

    const detailedArticles = [];

      //limited to 10 articles
    for (let i = 0; i < Math.min(articles.length, 10); i++) {
      const { title, url } = articles[i];
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Try getting the date from two possible selectors
        const date = await articlePage.evaluate(() => {
          const dateEl1 = document.querySelector('div.Page-dateModified');
          const dateEl2 = document.querySelector('[span-data-date]');
          return (dateEl1?.textContent || dateEl2?.textContent || 'Date not found').trim();
        });

        detailedArticles.push({ title, url, date });
        await articlePage.close();
      } catch (err) {
        console.warn(`Failed to retrieve date for article ${i + 1}: ${err.message}`);
        detailedArticles.push({ title, url, date: 'Date not found' });
      }
    }

    const filename = 'apClimateArticles.json';
    const fullPath = path.join(process.cwd(), filename);

    fs.writeFileSync(fullPath, JSON.stringify(detailedArticles, null, 2), 'utf8');
    console.log(`\nJSON file saved at: ${fullPath}`);

  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    await browser.close();
  }
}

apClimateScraper();
