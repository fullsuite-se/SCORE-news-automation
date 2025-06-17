const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function acccScraper() {
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        slowMo: 50
    });

    try {
        const page = await browser.newPage();
        await page.goto('https://www.accc.gov.au/news-centre?type=accc_news&query=environmental&custom_action=%2Fviews%2Fajax', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForSelector('.card-wrapper.contextual-region.h-100.col-12');

        const articles = await page.evaluate(() => {
            const articleNodes = document.querySelectorAll('.card-wrapper.contextual-region.h-100.col-12');
            const seen = new Set();
            const results = [];

            articleNodes.forEach(node => {
                const linkEl = node.querySelector('a.accc-date-card__link.row');
                const titleEl = node.querySelector('.accc-date-card__body h2');
                const monthEl = node.querySelector('.accc-date-card--publish--month');
                const dayEl = node.querySelector('.accc-date-card--publish--day');
                const yearEl = node.querySelector('.accc-date-card--publish--year');

                if (linkEl && titleEl && monthEl && dayEl && yearEl) {
                    const url = new URL(linkEl.getAttribute('href'), window.location.origin).href;
                    const title = titleEl.textContent.trim();
                    const date = `${monthEl.textContent.trim()} ${dayEl.textContent.trim()}, ${yearEl.textContent.trim()}`;

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

        const filename = 'acccArticles.json';
        const fullPath = path.join(process.cwd(), filename);
        fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
        console.log(`\n JSON saved at: ${fullPath}`);
        
    } catch (err) {
        console.error('Scraping failed:', err.message);
    } finally {
        await browser.close();
    }
}

acccScraper();
