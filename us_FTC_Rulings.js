const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function usFTCRulingsScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  const url = 'https://www.ftc.gov/legal-library/browse/cases-proceedings?sort_by=field_date&items_per_page=20&field_mission%5B29%5D=29&search=&field_competition_topics=All&field_consumer_protection_topics=1408&field_federal_court=All&field_industry=All&field_case_status=All&field_enforcement_type=All&search_matter_number=&search_civil_action_number=&start_date=&end_date=';

  try {
    console.log('Navigating to FTC page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForSelector('div.group', { timeout: 15000 });

    const articles = await page.evaluate(() => {
      const groups = Array.from(document.querySelectorAll('div.group'));
      return groups.slice(0, 10).map(group => {
        const linkEl = group.querySelector('a');
        const titleEl = group.querySelector('h3');
        const timeEl = group.querySelector('time[datetime]');

        const title = titleEl ? titleEl.textContent.trim() : null;
        const url = linkEl ? 'https://www.ftc.gov' + linkEl.getAttribute('href') : null;
        const date = timeEl ? timeEl.textContent.trim() : 'N/A';

        return { title, url, date };
      }).filter(item => item.title && item.url);
    });

    if (articles.length === 0) {
      console.log('No articles found.');
      return;
    }

    const filename = 'us_FTC_rulings.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
    console.log(`JSON file saved at: ${fullPath}`);
    console.log('Number of articles saved:', articles.length);
  } catch (err) {
    console.error('Scraping failed:', err.message);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

usFTCRulingsScraper();
