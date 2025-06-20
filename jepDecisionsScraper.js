const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function jepScraper() {
  const browser = await puppeteer.launch({ headless: true, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.jep.be/fr/decisions-du-jep/?_onderzoekscriteria=environnement';

  try {
    console.log('Navigating to JEP decisions page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    const articles = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('h3 > a'));
      return items.slice(0, 10).map(link => {
        const url = link.href;
        const titleFont = link.querySelector('font');
        const title = titleFont ? titleFont.textContent.trim() : link.textContent.trim();
        return { title, url };
      }).filter(article => article.title && article.url);
    });

    for (let i = 0; i < articles.length; i++) {
      const articlePage = await browser.newPage();
      await articlePage.goto(articles[i].url, { waitUntil: 'networkidle2', timeout: 60000 });

      const date = await articlePage.evaluate(() => {
        const dateDivs = Array.from(document.querySelectorAll('div.jet-listing-dynamic-field__content'));
        if (dateDivs.length === 0) return null;

        const lastDiv = dateDivs[dateDivs.length - 1];
        const fullText = lastDiv.innerText.trim();

        // Remove French date label if present
        const cleaned = fullText.replace(/Date de clôture\s*:?\s*/i, '').trim();

        // Extract date using regex (e.g. "12 juin 2024")
        const dateMatch = cleaned.match(/(\d{1,2}\s+[a-zéûîèêôîàäëïöüç]+\s+\d{4})/i);
        return dateMatch ? dateMatch[1] : cleaned;
      });

      articles[i].date = date || 'N/A';
      await articlePage.close();
    }

    const filename = 'jepDecisions.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');

    console.log(`JSON file saved at: ${fullPath}`);
    console.log('Number of articles saved:', articles.length);
  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

jepScraper();
