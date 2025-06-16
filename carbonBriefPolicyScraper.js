const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function carbonBriefPolicyScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.carbonbrief.org/policy/';

  try {
    console.log('Navigating to Carbon Brief Policy page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForSelector('div.col-xs-12.col-sm-7, div.content, div.content.justify-content-start');
    console.log('Post containers found.');

    const articles = await page.evaluate(() => {
      const containers = [
        ...document.querySelectorAll('div.col-xs-12.col-sm-7'),
        ...document.querySelectorAll('div.content'),
        ...document.querySelectorAll('div.content.justify-content-start')
      ];

      return containers.map(container => {
        const linkTag = container.querySelector('p.text-header-xxl.title a') || container.querySelector('p.text-header-s.line-clamp a');
        const titleEl = container.querySelector('p.text-header-xxl.title') || container.querySelector('p.text-header-s.line-clamp');
        const dateEl = container.querySelector('div.meta-info p.text-tag-meta');

        if (!linkTag || !titleEl) return null;

        return {
          title: titleEl.textContent.trim(),
          url: linkTag.href,
          date: dateEl ? dateEl.textContent.trim() : 'Date not found'
        };
      }).filter(Boolean);
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    const limitedArticles = articles.slice(0, 10);

    const filename = 'carbonBriefPolicy.json';
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

carbonBriefPolicyScraper();
