const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function aljazeeraScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.aljazeera.com/climate-crisis';

  try {
    console.log('Navigating to Al Jazeera Climate Crisis page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForSelector('li.themed-featured-posts-list__item, div.gc__content');
    console.log('Post containers found.');

    const articles = await page.evaluate(() => {
      const articleNodes = [
        ...document.querySelectorAll('li.themed-featured-posts-list__item'),
        ...document.querySelectorAll('div.gc__content')
      ];

      return articleNodes.map(el => {
        const linkTag = el.querySelector('a.u-clickable-card__link.article-card__link') || el.querySelector('h3.gc__title a');
        const titleSpan = el.querySelector('h3.article-card__title span') || el.querySelector('h3.gc__title') || el.querySelector('span');

        let dateSpan = el.querySelector(
          'footer.article-card__footer .gc__date .gc__date__date .date-simple span[aria-hidden="true"]'
        );

        if (!dateSpan) {
          dateSpan = el.querySelector(
            'footer.gc__footer .gc__meta .gc__date .gc__date__date .date-simple span[aria-hidden="true"]'
          );
        }

        if (!linkTag || !titleSpan) return null;

        return {
          title: titleSpan.textContent.trim(),
          url: linkTag.href,
          date: dateSpan ? dateSpan.textContent.trim() : 'Date not found'
        };
      }).filter(Boolean);
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    const limitedArticles = articles.slice(0, 10);

    const filename = 'aljazeera.json';
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

aljazeeraScraper();
