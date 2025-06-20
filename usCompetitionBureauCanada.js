const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function usCompetitionBureauCanada() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const baseUrl = 'https://competition-bureau.canada.ca';
  const url = `${baseUrl}/en/deceptive-marketing-practices/cases-and-outcomes`;

  try {
    console.log('Navigating to Competition Bureau Canada...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForSelector('tr[role="row"]', { timeout: 15000 });

    const articleLinks = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr[role="row"]'));
      return rows.slice(0, 10).map(row => {
        const tdList = row.querySelectorAll('td');
        const linkEl = tdList[2]?.querySelector('a');
        const url = linkEl ? linkEl.href : null;
        return url;
      }).filter(Boolean);
    });

    const results = [];

    for (const articleUrl of articleLinks) {
      const articlePage = await browser.newPage();
      try {
        await articlePage.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        await articlePage.waitForSelector('h1#wb-cont', { timeout: 10000 });

        const data = await articlePage.evaluate(() => {
          const titleEl = document.querySelector('h1#wb-cont');
          const bylineEl = document.querySelector('p.gc-byline');
          const contentDiv = document.querySelector('div.cmp-text');
          const dateP = contentDiv ? contentDiv.querySelector('p') : null;

          const title = titleEl ? titleEl.textContent.trim() : null;
          let dateText = dateP ? dateP.textContent.trim() : null;
          let date = 'N/A';

          if (dateText) {
            const match = dateText.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/);
            if (match && match[0]) {
              date = match[0];
            }
          }

          return { title, date };
        });

        if (data.title) {
          results.push({ title: data.title, url: articleUrl, date: data.date });
        }
      } catch (err) {
        console.log(`Skipping article due to error: ${articleUrl} - ${err.message}`);
      } finally {
        await articlePage.close();
      }
    }

    if (results.length === 0) {
      console.log('No articles found!');
      return;
    }

    const filename = 'usCompetitionBureauCanada.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`JSON file saved at: ${fullPath}`);
    console.log('Number of articles saved:', results.length);
  } catch (err) {
    console.error('Scraping failed:', err.message);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

usCompetitionBureauCanada();