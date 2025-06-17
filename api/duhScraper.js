const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function duhScraper() {
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        slowMo: 50
    });

    try {
        const page = await browser.newPage();
        await page.goto('https://www.duh.de/presse/pressemitteilungen/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        await page.waitForSelector('div.article.articletype-0');

        const articles = await page.evaluate(() => {
            const articleNodes = document.querySelectorAll('div.article.articletype-0');
            const seen = new Set();
            const results = [];

            articleNodes.forEach(node => {
                const linkEl = node.querySelector('h3 a');
                const titleEl = node.querySelector('span[itemprop="headline"]');
                const dateEl = node.querySelector('div.news-list-date');

                if (linkEl && titleEl && dateEl) {
                    const href = linkEl.getAttribute('href');
                    const title = titleEl.textContent.trim();
                    const date = dateEl.textContent.trim();
                    const url = new URL(href, window.location.origin).href;

                    if (!seen.has(url)) {
                        seen.add(url);
                        results.push({ title, date, url });
                    }
                }
            });

            return results.slice(0, 10);
        });

        if (articles.length === 0) {
            console.warn(' No articles found — layout might have changed.');
        }

        const filename = 'duhArticles.json';
        const fullPath = path.join(process.cwd(), filename);
        fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
        console.log(`\n JSON saved at: ${fullPath}`);
        
    } catch (err) {
        console.error(' Scraping failed:', err.message);
    } finally {
        await browser.close();
    }
}

duhScraper();
