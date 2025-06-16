const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function carbonBriefEnergyScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.carbonbrief.org/energy/';

  try {
    console.log('Navigating to Carbon Brief Energy page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('div.content, div.content.justify-content-start');

    const articles = await page.evaluate(() => {
      const containers = Array.from(document.querySelectorAll('div.content, div.content.justify-content-start'));

      const rawArticles = containers.map(container => {
        const linkTag = container.querySelector('a[href]');
        const titleTag = container.querySelector('p.text-header-xxl.title, p.text-header-s.line-clamp');
        const dateTag = container.querySelector('div.meta-info p.text-tag-meta');

        if (!linkTag || !titleTag) return null;

        return {
          title: titleTag.textContent.trim(),
          url: linkTag.href,
          date: dateTag ? dateTag.textContent.trim() : 'Date not found'
        };
      }).filter(Boolean);

      // Deduplicate based on unique URLs
      const seen = new Set();
      return rawArticles.filter(article => {
        if (seen.has(article.url)) return false;
        seen.add(article.url);
        return true;
      });
    });

    const limitedArticles = articles.slice(0, 10);

    const filename = 'carbonBriefEnergy.json';
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

carbonBriefEnergyScraper();
