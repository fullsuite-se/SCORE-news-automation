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
                '--no-sandbox', // Recommended for some environments
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Overcomes limited resource problems
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu' // Often helps with compatibility
            ]
        });
        const page = await browser.newPage();

        // Set a default timeout for navigation (e.g., 60 seconds)
        page.setDefaultNavigationTimeout(60000);

        // Optional: Set a realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');


        // Navigate to the specified URL.
        await page.goto(url, { waitUntil: 'domcontentloaded' }); // Wait until the DOM is loaded

        // Optional: Wait for specific elements to appear if content loads dynamically
        // await page.waitForSelector('.article-container-selector', { timeout: 5000 });

        // Use page.evaluate() to run JavaScript code within the context of the browser page.
        // This is where you'll use the DOM manipulation logic similar to the client-side script.
       const scrapedData = await page.evaluate((maxArticles) => {
            const results = [];
            // Find all elements that represent an article container.
            // <--- REPLACE THIS SELECTOR with the actual article container selector
            const articleElements = document.querySelectorAll('div.main > dl.date_sp');

            if (articleElements.length === 0) {
                console.warn("DIAGNOSTIC (Inner): No <article> elements found with the specified main selector ('.view-content > div.views-row > article').");
                console.warn("DIAGNOSTIC (Inner): Please ensure this selector is correct and the content is loaded on the page.");
                return [];
            } else {
                console.log(`DIAGNOSTIC (Inner): Found ${articleElements.length} potential article elements.`);
            }

            for (let i = 0; i < Math.min(articleElements.length, maxArticles); i++) {
                const articleElement = articleElements[i];


                // Extract Title
                // <--- REPLACE THIS SELECTOR
                const titleElement = articleElement.querySelector('a');
                const title = titleElement ? titleElement.innerText.trim() : 'N/A';

                // Extract Date
                // <--- REPLACE THIS SELECTOR
                const dateElement = articleElement.querySelector('dt');
                const date = dateElement ? dateElement.innerText.trim() : 'N/A'

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
const targetUrl = 'https://www.meti.go.jp/english/press/category_06.html';

// --- Run the scraper ---
scrapeArticlesWithPuppeteer(targetUrl)
    .then(result => {
        // You can do further processing with the 'result' array here
        console.log("Scraping process finished.");
    })
    .catch(error => {
        console.error("Top-level error during scraping execution:", error);
    });