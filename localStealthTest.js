import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import fs from 'fs'

puppeteer.use(StealthPlugin());

async function scrapeArticlesWithPuppeteer(url) {
    console.log(`Starting Puppeteer scraping for: ${url}`);

    const articles = [];
    const maxArticles = 10;
    let browser; // Declare browser outside try-catch for finally block access

    try {
        // Launch a headless browser instance using puppeteer-extra.
        // The StealthPlugin will modify the browser's behavior to be less detectable.
        browser = await puppeteer.launch({
            headless: true, // Still run headless, but with stealth features
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars',
                '--window-position=0,0',
                '--ignore-certifcate-errors',
                '--ignore-certifcate-errors-spki-list',
                '--disable-speech-api', // Disable speech api
                '--disable-features=site-per-process' // Often helps with compatibility
            ]
        });
        const page = await browser.newPage();

        // Set a default timeout for navigation (e.g., 60 seconds)
        page.setDefaultNavigationTimeout(60000);

        // Optional: Set a realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');


        // Navigate to the specified URL.
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Handle cookie consent (OneTrust) similar to non-stealth script
        const acceptButtonSelector = 'button#onetrust-accept-btn-handler';
        const cookieBannerSelector = 'div.ot-sdk-container';
        try {
            await page.waitForSelector(acceptButtonSelector, { visible: true, timeout: 5000 });
            await page.click(acceptButtonSelector);
            await page.waitForSelector(cookieBannerSelector, { hidden: true, timeout: 5000 });
            // Reload after accepting cookies to ensure content loads
            await page.reload({ waitUntil: 'networkidle2' });
        } catch (_) {
            // No cookie banner or it disappeared; continue
        }

        // Wait for the container and ensure results are populated (site loads via JS)
        await page.waitForSelector('div.widget-filter-listing-results', { timeout: 15000 });
        await page.waitForFunction(() => {
            const container = document.querySelector('div.widget-filter-listing-results');
            return !!container && container.querySelectorAll('div.article-list-result').length > 0;
        }, { timeout: 20000 });

        // Optional: Wait for specific elements to appear if content loads dynamically
        // await page.waitForSelector('.article-container-selector', { timeout: 5000 });

        // Use page.evaluate() to run JavaScript code within the context of the browser page.
        // This is where you'll use the DOM manipulation logic similar to the client-side script.
        const scrapedData = await page.evaluate((maxArticles) => {
            const results = [];
            // Find all elements that represent an article container.
            // <--- REPLACE THIS SELECTOR with the actual article container selector
            // const articleElements = document.querySelectorAll('ul > li');
            const articleElements = document.querySelectorAll('div.widget-filter-listing-results > div.article-list-result');

            if (articleElements.length === 0) {
                console.warn("No article container elements found with the provided selector. Please check your selector.");
                return [];
            }

            for (let i = 0; i < Math.min(articleElements.length, maxArticles); i++) {
                const articleElement = articleElements[i];

                // Extract Title
                // <--- REPLACE THIS SELECTOR
                const titleElement = articleElement.querySelector('a');
                const title = titleElement ? titleElement.innerText.trim() : 'N/A';

                // Extract Date
                // <--- REPLACE THIS SELECTOR
                const dateElement = articleElement.querySelector('div.timestamp');
                const date = dateElement ? dateElement.innerText.trim() : 'N/A'
                // const date = dateElement ? dateElement.getAttribute('datetime') : 'N/A'

                // Extract Link
                // <--- REPLACE THIS SELECTOR
                const linkElement = articleElement.querySelector('a');
                // Use window.location.origin to ensure absolute URLs
                const link = linkElement ? new URL(linkElement.getAttribute('href'), window.location.origin).href : 'N/A';

                results.push({
                    title: title,
                    url: link,
                    date: date,
                });
            }
            return results;
        }, maxArticles); // Pass maxArticles to the page.evaluate context

        articles.push(...scrapedData);

        console.log(`Successfully scraped ${articles.length} articles:`);
        console.table(articles);

        // --- Save articles to a JSON file ---
        const outputFileName = 'articles.json';
        fs.writeFileSync(outputFileName, JSON.stringify(articles, null, 2));
        console.log(`Articles saved to ${outputFileName}`);

        return articles;

    } catch (error) {
        console.error("An error occurred during Puppeteer scraping:", error);
        return [];
    } finally {
        // Ensure the browser is closed even if an error occurs
        if (browser) {
            await browser.close();
        }
        console.log("Browser closed.");
    }
}

// --- Configuration ---
// <--- REPLACE THIS WITH THE ACTUAL URL OF THE WEBSITE YOU WANT TO SCRAPE
const targetUrl = 'https://www.sgxgroup.com/media-centre?value=sustainability';

// --- Run the scraper ---
scrapeArticlesWithPuppeteer(targetUrl)
    .then(result => {
        // You can do further processing with the 'result' array here
        console.log("Scraping process finished.");
    })
    .catch(error => {
        console.error("Top-level error during scraping execution:", error);
    });