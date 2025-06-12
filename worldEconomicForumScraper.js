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
        // Attempt to find a nearby date/time element
        const dateElement = link.closest('div').querySelector('time, span, div');
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

    // Build XML content
    let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n<articles>\n';

    for (const article of articles) {
      xmlContent += `  <article>\n`;
      xmlContent += `    <title>${escapeXml(article.title)}</title>\n`;
      xmlContent += `    <date>${escapeXml(article.date)}</date>\n`;
      xmlContent += `    <url>${escapeXml(article.url)}</url>\n`;
      xmlContent += `  </article>\n`;
    }

    xmlContent += '</articles>\n';

    // Save XML to file
    const filename = path.join(process.cwd(), 'worldEconomicForum.xml');
    fs.writeFileSync(filename, xmlContent, 'utf8');
    console.log(`Saved ${articles.length} articles to XML file: ${filename}`);

    // Log articles summary
    console.log(`\nScraped ${articles.length} articles:\n`);
    articles.forEach((article, i) => {
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

// Helper to escape XML special chars
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

worldEconomicForumScraper();
