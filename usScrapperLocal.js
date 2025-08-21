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

        let currentPageNum = 1;
        const nextPageSelector = 'a.next'; // <--- IMPORTANT: REPLACE WITH ACTUAL NEXT PAGE BUTTON/LINK SELECTOR
         const firstArticleLinkOnPageSelector = 'ol.basic-search-results-lists.expanded-view > li.compact > span.result-heading > a';

        while (true) {
            const scrapedData = await page.evaluate((maxArticles) => {
            var results = [];
            // Find all elements that represent an article container.
            // <--- REPLACE THIS SELECTOR with the actual article container selector
            const items = Array.from(
                document.querySelectorAll(
                    "ol.basic-search-results-lists.expanded-view > li.compact, ol.basic-search-results-lists > li.compact"
                )
            );

            const length = items.length;

            results = items.map((item) => {
                const legislationName =
                    `${item.querySelector(".result-heading a")?.innerText.trim()} - ${item
                      .querySelector(".result-title")
                      ?.innerText.trim()}` || "";
                
                const firstSelector = item.querySelectorAll(".result-item a")[2]?.innerText.trim();

                const displayTitle = firstSelector && firstSelector.includes("PDF")
                    ? item.querySelector(".result-item:nth-child(5)")?.innerText.trim() || ""
                    : firstSelector || "";

                const sourceRel =
                    item.querySelector(".result-heading a")?.getAttribute("href") || "";
                 const sourcelink = sourceRel.startsWith("http")
                    ? sourceRel
                    : "https://congress.gov" + sourceRel;

                let pdflink = null;
                const latestActionSpan = Array.from(
                    item.querySelectorAll("span.result-item")
                    ).find((span) => span.textContent.includes("Latest Action"));

                if (latestActionSpan) {
                    const pdfAnchor = latestActionSpan.querySelector('a[href$=".pdf"]');
                    if (pdfAnchor) {
                        const href = pdfAnchor.getAttribute("href");
                        pdflink = href.startsWith("http")
                            ? href
                            : "https://congress.gov" + href;
                        }
                    }
                    return {length, legislationName, displayTitle, sourcelink, pdflink};
                })
                return results;
            }, maxArticles); // Pass maxArticles to the page.evaluate context

            articles.push(...scrapedData);
            
             const firstArticleTextOnCurrentPage = await page.evaluate(() => {
                // Hardcode the selector directly here
                const firstArticle = document.querySelector('ol.basic-search-results-lists.expanded-view > li.compact, ol.basic-search-results-lists > li.expanded');
                return firstArticle ? firstArticle.innerText : '';
            }); 

             const currentFirstArticleLink = await page.evaluate(selector => {
                const firstArticleElement = document.querySelector(selector);
                return firstArticleElement ? firstArticleElement.href : '';
            }, firstArticleLinkOnPageSelector);

             const nextButton = await page.$(nextPageSelector);
            
            if (nextButton) {
                // Check if the next button is disabled or has an attribute indicating it's the last page
                const isDisabled = await nextButton.evaluate(el => el.disabled || el.classList.contains('desativada') || el.getAttribute('aria-disabled') === 'true');
                const nextButtonHref = await nextButton.evaluate(el => el.href);

                console.log(`DIAGNOSTIC (Outer): Next button found. Is disabled: ${isDisabled}. Href: ${nextButtonHref}`);

                if (isDisabled || !nextButtonHref) { // If disabled or no valid href, assume no more pages
                    console.log("DIAGNOSTIC (Outer): Next button is disabled or has no valid href. Exiting pagination loop.");
                    break;
                }

                console.log(`Navigating to next page (${currentPageNum + 1})...`);
                await Promise.all([
                    nextButton.click(),
                    // Wait for the URL of the page to change AND the first article's link to be different
                    page.waitForFunction(
                        (oldFirstArticleLink, selector) => {
                            const newFirstArticleElement = document.querySelector(selector);
                            const newFirstArticleLink = newFirstArticleElement ? newFirstArticleElement.href : null;
                            // Log inside the browser context to see what it's evaluating
                            console.log(`waitForFunction (Content Change): Old Link: ${oldFirstArticleLink}, New Link: ${newFirstArticleLink}`);
                            return newFirstArticleElement && newFirstArticleLink !== oldFirstArticleLink;
                        },
                        { timeout: 120000 }, // Increased timeout for this critical wait to 60 seconds
                        currentFirstArticleLink, // Current first article link
                        firstArticleLinkOnPageSelector // Selector for the first article link
                    )
                ]);
                currentPageNum++;
            } else {
                console.log("No more pages found. Exiting pagination loop (Next button not found).");
                break;
            }
        }

        // --- NEW ROBUST WAITING STRATEGY: Wait for a minimum number of date-grouping list items ---
       

        // articles.push(...scrapedData);

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
const targetUrl = 'https://www.congress.gov/search?q=%7B%22source%22%3A%22legislation%22%2C%22congress%22%3A%22all%22%2C%22bill-status%22%3A%22law%22%2C%22subject%22%3A%22Health%22%7D';

// --- Run the scraper ---
scrapeArticlesWithPuppeteer(targetUrl)
    .then(result => {
        // You can do further processing with the 'result' array here
        console.log("Scraping process finished.");
    })
    .catch(error => {
        console.error("Top-level error during scraping execution:", error);
    });