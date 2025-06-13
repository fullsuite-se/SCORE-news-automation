const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function asciComplaintScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.ascionline.in/complaint-outcomes/';

  try {
    console.log('Navigating to ASCI Complaint Outcomes page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Click "Show More" once, then wait for new content
    const previousCount = await page.$$eval('li', els => els.length);
    const button = await page.$('button.showMoreCom');

    if (button) {
      await button.click();
      console.log('Clicked "Show More" once');

      await page.waitForFunction(
        prev => document.querySelectorAll('li').length > prev,
        {},
        previousCount
      );

      await new Promise(res => setTimeout(res, 1500)); // Extra wait time
    } else {
      console.log('No "Show More" button found.');
    }

    // Scrape the articles
    const articles = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('li'));
      return items.map(item => {
        const linkEl = item.querySelector('a[href]');
        const url = linkEl ? linkEl.href : null;

        const titleEl = item.querySelector('p.comOutcomeTitle');
        const title = titleEl ? titleEl.textContent.trim() : null;

        const dateEl = item.querySelector('p.spanline');
        let date = null;
        if (dateEl) {
          const text = dateEl.textContent.trim();
          const match = text.match(/\d{1,2} [A-Za-z]+ \d{4}/);
          date = match ? match[0] : null;
        }

        return { title, url, date };
      }).filter(article => article.title && article.url && article.date);
    });

    const limitedArticles = articles.slice(0, 10);
    const filename = 'asciComplaintOutcomes.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(limitedArticles, null, 2), 'utf8');

    console.log(`JSON file saved at: ${fullPath}`);
    console.log('Number of articles saved:', limitedArticles.length);
  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

asciComplaintScraper();