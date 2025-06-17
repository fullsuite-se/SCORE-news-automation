const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function earthjusticeScraper() {
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        slowMo: 50
    });

    try {
        const page = await browser.newPage();
        const mainUrl = 'https://earthjustice.org/news';
        const moreReleasesUrl = 'https://earthjustice.org/library?_type=press&_library_sort=sort_by_newest';

        const articles = [];
        const seen = new Set();

        // Scrape main news page
        await page.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('.teaser__list--text');

        const mainArticles = await page.evaluate(() => {
            const results = [];
            const nodes = document.querySelectorAll('.teaser__list--text');

            nodes.forEach(node => {
                const titleEl = node.querySelector('h3.h3_type--editorial.m-t-5 a');
                const dateEl = node.querySelector('.teaser__list--meta span.teaser__list--date');

                if (titleEl && dateEl) {
                    const title = titleEl.getAttribute('title')?.trim();
                    const url = titleEl.href;
                    const date = dateEl.textContent.trim();

                    if (title && url && date) {
                        results.push({ title, date, url });
                    }
                }
            });

            return results;
        });

        for (const article of mainArticles) {
            if (!seen.has(article.url)) {
                seen.add(article.url);
                articles.push(article);
            }
            if (articles.length >= 10) break;
        }

        // If fewer than 10 articles, continue with More Releases page
        if (articles.length < 10) {
            await page.goto(moreReleasesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForSelector('.teaser__grid');

            const moreArticles = await page.evaluate(() => {
                const results = [];
                const nodes = document.querySelectorAll('.teaser__grid');

                nodes.forEach(node => {
                    const titleEl = node.querySelector('h3.h3_type--editorial.m-t-10 a');
                    const dateEl = node.querySelector('.teaser__list--meta.m-t-5 span.teaser__list--date');

                    if (titleEl && dateEl) {
                        const title = titleEl.getAttribute('title')?.trim();
                        const url = titleEl.href;
                        const date = dateEl.textContent.trim();

                        if (title && url && date) {
                            results.push({ title, date, url });
                        }
                    }
                });

                return results;
            });

            for (const article of moreArticles) {
                if (!seen.has(article.url)) {
                    seen.add(article.url);
                    articles.push(article);
                }
                if (articles.length >= 10) break;
            }
        }

        if (articles.length === 0) {
            console.warn('No articles found.');
        }

        const filename = 'earthjusticeArticles.json';
        const fullPath = path.join(process.cwd(), filename);
        fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
        console.log(`\n JSON saved at: ${fullPath}`);

    } catch (err) {
        console.error(' Scraping failed:', err.message);
    } finally {
        await browser.close();
    }
}

earthjusticeScraper();
