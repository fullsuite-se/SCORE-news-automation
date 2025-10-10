import puppeteer from 'puppeteer'
import fs from 'fs'

async function scrapeArticlesWithPuppeteer(url) {
    console.log(`Starting Puppeteer scraping for: ${url}`);

    const articles = [];
    const maxArticles = 10;
    let browser; // Declare browser outside try-catch for finally block access

    try {
        // Launch a headless browser instance.
        // `headless: true` runs Chrome without a visible UI.
        // Set to `headless: false` if you want to see the browser automation.
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        // Set a default timeout for navigation (e.g., 60 seconds)
        page.setDefaultNavigationTimeout(60000);

        // Navigate to the specified URL.
        await page.goto(url, { waitUntil: 'domcontentloaded' }); // Wait until the DOM is loaded

        // Optional: Wait for specific elements to appear if content loads dynamically
        // await page.waitForSelector('.article-container-selector', { timeout: 5000 });

        // Use page.evaluate() to run JavaScript code within the context of the browser page.
        // This is where you'll use the DOM manipulation logic similar to the client-side script.

       const acceptButtonSelector = 'button#onetrust-accept-btn-handler'; // Example: A button with ID 'accept-cookies'
        const cookieBannerSelector = 'div.ot-sdk-container'; // Example: The banner div itself

        console.log("DIAGNOSTIC (Outer): Checking for cookie consent banner...");
        try {
            await page.waitForSelector(acceptButtonSelector, { visible: true, timeout: 5000 });
            console.log("DIAGNOSTIC (Outer): Cookie accept button found. Attempting to click...");

            await page.evaluate((selector) => {
                const button = document.querySelector(selector);
                if (button) {
                    button.click();
                } else {
                    throw new Error(`Button with selector ${selector} not found in page.evaluate.`);
                }
            }, acceptButtonSelector);

            console.log("DIAGNOSTIC (Outer): Cookie accept button clicked (via evaluate).");

            await page.waitForSelector(cookieBannerSelector, { hidden: true, timeout: 5000 });
            console.log("DIAGNOSTIC (Outer): Cookie banner disappeared.");

            // Optional: Reload page after cookie acceptance for a clean state
            console.log("DIAGNOSTIC (Outer): Reloading page after cookie acceptance...");
            await page.reload({ waitUntil: 'networkidle0' });
            console.log("DIAGNOSTIC (Outer): Page reloaded.");


        } catch (cookieError) {
            console.warn(`DIAGNOSTIC (Outer): No cookie banner/accept button found or it timed out, or click failed. Proceeding without explicit cookie acceptance. Error: ${cookieError.message}`);
        }

        /*
         console.log("DIAGNOSTIC (Outer): Waiting for 'ul.gsc-excerpt-list' to appear...");
        await page.waitForSelector('ul.gsc-excerpt-list', { timeout: 10000 });
        console.log("DIAGNOSTIC (Outer): 'ul.gsc-excerpt-list' found.");
        */


        // --- Extract articles from the HTML structure ---
        const scrapedData = await page.evaluate((maxArticles) => {
            const results = [];
            // Find all elements that represent an article container.
            // <--- REPLACE THIS SELECTOR with the actual article container selector
            // const articleElements = document.querySelectorAll('ul > li');
            const articleElements = document.querySelectorAll('div.row > div.col-12 > div.news-box');
    
            if (articleElements.length === 0) {
                console.warn("No article container elements found with the provided selector. Please check your selector.");
                return [];
            }
    
            for (let i = 0; i < Math.min(articleElements.length, maxArticles); i++) {
                const articleElement = articleElements[i];
    
                // Extract Title
                // <--- REPLACE THIS SELECTOR
                const titleElement = articleElement.querySelector('h5 > a');
                const title = titleElement ? titleElement.innerText.trim() : 'N/A';
    
                // Extract Date
                // <--- REPLACE THIS SELECTOR
                const dateElement = articleElement.querySelector('p.news-date');
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

        console.log("DIAGNOSTIC (Outer): Article data extraction finished.");

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
        if (browser) {
            await browser.close();
        }
        console.log("Browser closed.");
    }
}

// --- Configuration ---
// <--- REPLACE THIS WITH THE ACTUAL URL OF THE WEBSITE YOU WANT TO SCRAPE
const targetUrl = 'https://socpa.org.sa/Socpa/Media-Center/News.aspx';

// --- Run the scraper ---
scrapeArticlesWithPuppeteer(targetUrl)
    .then(result => {
        // You can do further processing with the 'result' array here
        console.log("Scraping process finished.");
    })
    .catch(error => {
        console.error("Top-level error during scraping execution:", error);
    });