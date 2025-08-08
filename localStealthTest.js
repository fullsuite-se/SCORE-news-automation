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
       const dateGroupingItemSelector = 'ul.gsc-excerpt-list > li.gsc-excerpt-list__item';
        const minExpectedDateGroups = 1; // At least one date group should be present

        console.log(`DIAGNOSTIC (Outer): Waiting for at least ${minExpectedDateGroups} date grouping items to be present using waitForFunction...`);
        await page.waitForFunction(
            (selector, minCount) => document.querySelectorAll(selector).length >= minCount,
            { timeout: 30000 }, // Max wait time
            dateGroupingItemSelector,
            minExpectedDateGroups
        );
        console.log(`DIAGNOSTIC (Outer): At least ${minExpectedDateGroups} date grouping items are now present on the page.`);
        
        // ADDED: Take a screenshot for visual debugging
        const screenshotPath = 'debug_screenshot_before_scrape.png';
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`DIAGNOSTIC (Outer): Screenshot saved to ${screenshotPath}`);


        console.log("DIAGNOSTIC (Outer): About to scrape articles using nested iteration.");

        // Get all date-grouping list items as ElementHandle objects
        const dateGroupingHandles = await page.$$(dateGroupingItemSelector);

        if (dateGroupingHandles.length === 0) {
            console.warn("DIAGNOSTIC (Outer): page.$$() found 0 date grouping items. Investigate page rendering.");
        } else {
            console.log(`DIAGNOSTIC (Outer): page.$$() found ${dateGroupingHandles.length} total date grouping items.`);
        }

        // Iterate over each date-grouping ElementHandle
        for (const dateGroupHandle of dateGroupingHandles) {
            // Extract the date for this group
            const groupDate = await dateGroupHandle.evaluate(element => {
                const dateHeading = element.querySelector('h2.gsc-excerpt-list__item-date');
                return dateHeading ? dateHeading.innerText.trim() : 'N/A';
            });

            // Get the individual article items within this date group
            const individualArticleHandles = await dateGroupHandle.$$('ul.gsc-u-list-unstyled > li.gsc-excerpt-item');

            if (individualArticleHandles.length === 0) {
                console.warn(`DIAGNOSTIC (Outer): No individual articles found for date group: ${groupDate}.`);
                continue; // Skip to the next date group if no articles are found
            }

            for (let i = 0; i < individualArticleHandles.length; i++) {
                // Limit the total number of articles scraped
                if (articles.length >= maxArticles) {
                    console.log(`DIAGNOSTIC (Outer): Reached maxArticles limit (${maxArticles}). Stopping scrape.`);
                    break; // Exit inner loop
                }

                const articleHandle = individualArticleHandles[i];

                // Use element.evaluate() to run JavaScript code on the specific article handle
                const articleData = await articleHandle.evaluate((element, currentGroupDate) => {
                    // --- Extract Title and Link: ---
                    const articleLinkElement = element.querySelector('a.gsc-excerpt-item__link');
                    // The title is inside a span within the link
                    const titleElement = articleLinkElement ? articleLinkElement.querySelector('span.gsc-excerpt-item__title') : null;
                    const title = titleElement ? titleElement.innerText.trim() : 'N/A';
                    // The link is the href of the main <a> tag
                    const link = articleLinkElement ? new URL(articleLinkElement.getAttribute('href'), window.location.origin).href : 'N/A';

                    // --- Extract Time and combine with Group Date: ---
                    const timeElement = articleLinkElement ? articleLinkElement.querySelector('time.gsc-date__date') : null;
                    const time = timeElement ? timeElement.getAttribute('datetime') : ''; // Get the full datetime string

                    // Combine group date and article time for a complete timestamp
                    // Example: "24 July 2025" and "7/24/2025 11:15:00 AM"
                    // We'll use the datetime attribute directly as it's often machine-readable.
                    const fullDateTime = time || currentGroupDate; // Prefer datetime attribute, fallback to group date

                    return { title, date: fullDateTime, link };
                }, groupDate); // Pass groupDate as an argument to evaluate

                articles.push(articleData);
            }
            if (articles.length >= maxArticles) {
                break; // Exit outer loop if maxArticles limit is reached
            }
        }

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
const targetUrl = 'https://www.consilium.europa.eu/en/press/press-releases/?keyword=&DateFrom=&DateTo=&Topic=122254&Topic=122124&Topic=122161&Topic=122178';

// --- Run the scraper ---
scrapeArticlesWithPuppeteer(targetUrl)
    .then(result => {
        // You can do further processing with the 'result' array here
        console.log("Scraping process finished.");
    })
    .catch(error => {
        console.error("Top-level error during scraping execution:", error);
    });