const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function worldEconomicForumScraper() {
  const browser = await puppeteer.launch({ headless: true, slowMo: 50 });
  const page = await browser.newPage();

  const url = 'https://www.weforum.org/stories/sustainable-development/';

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Scrape all articles
    const articles = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.chakra-heading.wef-16v1g8r'));

      return links.map(link => {
        let dateText = null;
        const dateElement = link.closest('div')?.querySelector('time, span, div');
        if (dateElement) dateText = dateElement.textContent.trim();

        return {
          title: link.textContent.trim(),
          url: link.href,
          date: dateText || 'Date not found'
        };
      });
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;

      //deduplication
         const uniqueKey = `${title}||${url}`;
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          results.push({ title, url, date });
        }
    }

    // Limit to 10 articles
    const limitedArticles = articles.slice(0, 10);

    // Save JSON to file
    const filename = 'worldEconomicForum.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(limitedArticles, null, 2), 'utf8');
    console.log(`\nJSON file saved at: ${fullPath}`);

  } catch (error) {
    console.error('Error scraping:', error);
  } finally {
    await browser.close();
  }
}

worldEconomicForumScraper();
