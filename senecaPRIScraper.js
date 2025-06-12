const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function senecaPRIScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  const url = 'https://senecaesg.com/insights-news/';

  try {
    console.log('Navigating to Seneca ESG Insights & News page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('div.post.col-3', { timeout: 15000 });
    console.log('Post containers found.');

    // Extract all articles
    const articles = await page.evaluate(() => {
      const posts = Array.from(document.querySelectorAll('div.post.col-3'));
      return posts.map(post => {
        const linkEl = post.querySelector('a[href]');
        const url = linkEl ? linkEl.href : null;

        const titleEl = post.querySelector('h2');
        const title = titleEl ? titleEl.textContent.trim() : null;

        const dateEl = post.querySelector('div.post-date');
        const date = dateEl ? dateEl.textContent.trim() : null;

        return { title, url, date };
      }).filter(article => article.title && article.url); // Filter out incomplete articles
    });

    if (articles.length === 0) {
      console.log('No articles found!');
      return;
    }

    // Build XML content
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<articles>\n`;
    articles.forEach(({ title, url, date }) => {
      xml += `  <article>\n`;
      xml += `    <title>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>\n`;
      xml += `    <date>${date ? date.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''}</date>\n`;
      xml += `    <url>${url}</url>\n`;
      xml += `  </article>\n`;
    });
    xml += `</articles>`;

    const filename = 'senecaPRI.xml';
    const fullPath = path.join(process.cwd(), filename);

    fs.writeFileSync(fullPath, xml, 'utf8');
    console.log(`\nXML file saved at: ${fullPath}`);
    console.log('Number of articles saved:', articles.length);

  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

senecaPRIScraper();
