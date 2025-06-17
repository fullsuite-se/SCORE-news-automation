const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function clientearthScraper() {
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        slowMo: 50
    });

    try {
        const page = await browser.newPage();
        await page.goto('https://www.clientearth.org/latest/news/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForSelector('.resultsContainer a.item.news');

        const articles = await page.evaluate(() => {
            const articleNodes = document.querySelectorAll('.resultsContainer a.item.news');
            const seen = new Set();
            const results = [];

            articleNodes.forEach(node => {
                const titleEl = node.querySelector('h5.title');
                const dateEl = node.querySelector('p.date');
                const href = node.getAttribute('href');

                if (titleEl && dateEl && href) {
                    const title = titleEl.textContent.trim();
                    const date = dateEl.textContent.trim();
                    const url = new URL(href, window.location.origin).href;

                    //deduplication
                    if (!seen.has(url)) {
                        seen.add(url);
                        results.push({ title, date, url });
                    }
                }
            });

            return results.slice(0, 10);
        });

        if (articles.length === 0) {
            console.warn('No articles found.');
        }

        const filename = 'clientearthArticles.json';
        const fullPath = path.join(process.cwd(), filename);
        fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
        console.log(`\n JSON saved at: ${fullPath}`);

    } catch (err) {
        console.error('Scraping failed:', err.message);
    } finally {
        await browser.close();
    }
}

clientearthScraper();
