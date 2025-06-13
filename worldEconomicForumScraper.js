const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function worldEconomicForumScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  const url = 'https://www.weforum.org/stories/sustainable-development/';

  try {
    console.log('Navigating to page...');
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
    }

    // Limit to 10 articles
    const limitedArticles = articles.slice(0, 10);

    // Save JSON to file
    const filename = path.join(process.cwd(), 'worldEconomicForum.json');
    fs.writeFileSync(filename, JSON.stringify(limitedArticles, null, 2), 'utf8');
    console.log(`\n Saved ${limitedArticles.length} articles to JSON file: ${filename}`);

    // Log articles summary
    console.log(`\nScraped ${limitedArticles.length} articles:\n`);
    limitedArticles.forEach((article, i) => {
      console.log(`#${i + 1}`);
      console.log(`Title: ${article.title}`);
      console.log(`Date: ${article.date}`);
      console.log(`URL: ${article.url}`);
      console.log('-------------------------');
    });

  } catch (error) {
    console.error('Error scraping:', error);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

worldEconomicForumScraper();
