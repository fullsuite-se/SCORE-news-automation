const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function ecFinanceNewsScraper() {
  const browser = await puppeteer.launch({
    headless: false, 
    defaultViewport: null,
    slowMo: 50, 
  });

  const page = await browser.newPage();
  const baseUrl = 'https://finance.ec.europa.eu/finance-news_en?f%5B0%5D=oe_news_subject%3Ahttp%3A//data.europa.eu/uxp/det_87';

  try {
    
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    
    await page.waitForSelector('div.ecl-content-item-block__item', { timeout: 60000 }); 
    const articles = await page.evaluate(() => {
      
      const articleBlocks = document.querySelectorAll('div.ecl-content-item-block__item');
      const results = [];

      articleBlocks.forEach(block => {
        
        const articleElement = block.querySelector('article.ecl-content-item');

        if (articleElement) { 
          const titleEl = articleElement.querySelector('div.ecl-content-block__title a.ecl-link');
          const dateEl = articleElement.querySelector('ul.ecl-content-block__primary-meta-container time');

          if (titleEl && dateEl) {
            const title = titleEl.textContent.trim();
            const url = titleEl.getAttribute('href');
            
            const absoluteUrl = url.startsWith('http') ? url : new URL(url, window.location.origin).href;
            const date = dateEl.textContent.trim();

            if (title && absoluteUrl && date) {
              results.push({ title, url: absoluteUrl, date });
            }
          }
        }
      });

      return results;
    });

    const filePath = path.join(process.cwd(), 'ecFinanceNewsArticles.json');
    fs.writeFileSync(filePath, JSON.stringify(articles, null, 2), 'utf8');
    console.log(`\nJSON saved to ${filePath}`);
    console.log(`Scraped ${articles.length} articles.`);

  } catch (err) {
    console.error('Scraping failed:', err.message);
    
  } finally {
    await browser.close();
  }
}

ecFinanceNewsScraper();