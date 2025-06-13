const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Fallback scroll delay using native JS timeout
async function autoScroll(page, timeout = 30000) {
  const start = Date.now();
  let lastHeight = await page.evaluate('document.body.scrollHeight');
  let sameHeightCounter = 0;

  while (Date.now() - start < timeout && sameHeightCounter < 3) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await new Promise(resolve => setTimeout(resolve, 1000));

    const newHeight = await page.evaluate('document.body.scrollHeight');

    if (newHeight === lastHeight) {
      sameHeightCounter++;
    } else {
      sameHeightCounter = 0;
      lastHeight = newHeight;
    }
  }
  console.log(' Auto-scrolling complete.');
}

async function scmpScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.scmp.com/topics/environmental-social-and-corporate-governance-esg';

  try {
    console.log(' Opening SCMP ESG page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log(' Scrolling to load all articles...');
    await autoScroll(page);

    console.log(' Extracting article data...');
    const articles = await page.evaluate(() => {
      function extractArticlesFrom(selector) {
        const containers = document.querySelectorAll(selector);
        const results = [];

        //HTML elements where the article information is in
        containers.forEach(container => {
          try {
            const link = container.querySelector(
              'a[target="_self"].efy545l11.css-652fy1.ecgc78b0[data-qa="BaseLink-renderAnchor-StyledAnchor"]'
            );
            const headline = container.querySelector('span[data-qa="ContentHeadline-Headline"]');
            const timeEl = container.querySelector('time[data-qa="ContentActionBar-handleRenderDisplayDateTime-time"]');

            if (link && headline) {
              results.push({
                title: headline.textContent.trim(),
                url: link.href,
                date: timeEl?.getAttribute('datetime') || timeEl?.textContent.trim() || 'Unknown',
              });
            }
          } catch (_) {}
        });

        return results;
      }

      //Dividers found in the website
      const selectors = [
        'div.e102obc92.e1daqvjd0.css-1oukeou.e2fukww19',
        'div.e10l40di1.e1daqvjd0.css-grxlrd.efy545l13',
        'div.eimrqvo5.e1daqvjd0.css-yg8c0h.efy545l13',
        'div.e10l40di2.e1daqvjd0.css-g1onk.eqs07hl11',
      ];

      let all = [];
      selectors.forEach(sel => {
        all = all.concat(extractArticlesFrom(sel));
      });

      return all;
    });

    if (!articles.length) {
      console.warn(' No articles found!');
      return;
    }

    //Limits to 10 articles
    const limitedArticles = articles.slice(0, 10);

    //Creates JSON file
    const filename = 'scmp-esg-articles.json';
    fs.writeFileSync(
      path.join(process.cwd(), filename),
      JSON.stringify(limitedArticles, null, 2),
      'utf8'
    );
    console.log(` JSON saved as ${filename}`);

  } catch (err) {
    console.error(' Error scraping:', err.message);
  } finally {
    await browser.close();
    console.log(' Browser closed.');
  }
}

scmpScraper();
