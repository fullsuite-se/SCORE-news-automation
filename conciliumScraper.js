const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function conciliumScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  const url = 'https://www.consilium.europa.eu/en/press/press-releases/?keyword=&DateFrom=&DateTo=&Topic=122254&Topic=122124&Topic=122161&Topic=122178';

  try {
    console.log('Navigating to page...');
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });

    const html = await page.content();
    fs.writeFileSync('page-debug.html', html);
    console.log('Saved full page HTML to page-debug.html.');

    // Handle cookie banner
    try {
      await page.waitForSelector('#cookie-banner button[data-dismiss="cookie-banner"]', { timeout: 5000 });
      await page.click('#cookie-banner button[data-dismiss="cookie-banner"]');
      console.log('Cookie banner accepted.');
      await page.waitForTimeout(2000);
    } catch {
      console.log('No cookie banner found.');
    }

    await page.waitForSelector('li.gsc-excerpt-item', { timeout: 15000 });
    const articles = (await page.$$('li.gsc-excerpt-item')).slice(0, 10);
    console.log(`Found ${articles.length} articles on the page.`);

    const articlesData = [];

    //Finds articles in the HTML elements
    for (const article of articles) {
      const title = await article.$eval('a.gsc-excerpt-item__title', el => el.textContent.trim());
      const href = await article.$eval('a.gsc-excerpt-item__title', el => el.getAttribute('href'));
      const timeText = await article.$eval('time.gsc-date__date', el => el.textContent.trim());

      const fullDate = await page.evaluate(articleEl => {
        let dateHeader = null;
        let el = articleEl.previousElementSibling;
        while (el) {
          if (el.tagName === 'H2' && el.classList.contains('gsc-excerpt-list__item-date')) {
            dateHeader = el;
            break;
          }
          el = el.previousElementSibling;
        }
        if (!dateHeader) {
          let parent = articleEl.parentElement;
          while (parent) {
            const siblings = Array.from(parent.parentElement ? parent.parentElement.children : []);
            const idx = siblings.indexOf(parent);
            for (let i = idx - 1; i >= 0; i--) {
              const sibling = siblings[i];
              if (sibling.tagName === 'H2' && sibling.classList.contains('gsc-excerpt-list__item-date')) {
                dateHeader = sibling;
                break;
              }
            }
            if (dateHeader) break;
            parent = parent.parentElement;
          }
        }
        return dateHeader ? dateHeader.textContent.trim() : '';
      }, article);

      const publishedAt = fullDate ? `${fullDate} ${timeText}` : timeText;
      const fullUrl = new URL(href, 'https://www.consilium.europa.eu').href;

      articlesData.push({ title, publishedAt, url: fullUrl });
    }

    // Write to JSON
    const jsonPath = path.join(__dirname, 'conciliumArticles.json');
    fs.writeFileSync(jsonPath, JSON.stringify(articlesData, null, 2), 'utf8');
    console.log(`\n JSON saved to ${jsonPath}`);
    console.log(`Total articles saved: ${articlesData.length}`);

  } catch (error) {
    console.error('Error scraping:', error);
  } finally {
    console.log('Closing browser in 10 seconds...');
    setTimeout(async () => {
      await browser.close();
      console.log('Browser closed.');
    }, 10000);
  }
}

conciliumScraper();
