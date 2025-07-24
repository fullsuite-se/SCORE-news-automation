import fs from 'fs';
import path from 'path';
import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(stealthPlugin());

/**
 * Configures and returns the Puppeteer library with local launch options.
 * This function is designed for local execution.
 * @returns {object} An object containing the Puppeteer instance and its launch options.
 */
async function getBrowserModules() {
  const puppeteer = puppeteerExtra;
  return {
    puppeteer,
    launchOptions: {
      headless: 'new', // Use "new" headless mode for better performance and stability
      slowMo: 50,      // Slows down Puppeteer operations by 50ms for visual debugging
      args: [
        '--no-sandbox',              // Required for running in some environments (e.g., Docker, CI/CD)
        '--disable-setuid-sandbox',  // Disables the setuid sandbox (often needed on Linux)
        '--disable-gpu',             // Disables GPU hardware acceleration (can help with stability)
        '--disable-dev-shm-usage',   // Overcomes /dev/shm limitations in some environments
      ],
      // executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // Uncomment and set if you want to use a specific Chrome/Chromium installation
    }
  };
}

/**
 * Main asynchronous function to perform the web scraping task.
 * This function encapsulates the entire scraping process, from launching the browser
 * to extracting data and saving it to a file.
 */
async function main() {
  let browser; // Declare browser variable outside try block for finally access
  const url = 'https://asic.gov.au/newsroom';

  try {
    // Get the configured Puppeteer instance and launch options
    const { puppeteer, launchOptions } = await getBrowserModules();

    console.log('--- Puppeteer Launch Information ---');
    console.log('Launch Options:', JSON.stringify(launchOptions, null, 2));
    console.log('--- End Launch Info ---');
    
    console.log('Attempting to launch Puppeteer browser...');
    browser = await puppeteer.launch(launchOptions); // Launch the browser
    const page = await browser.newPage(); // Open a new page in the browser

    console.log('Navigating to ASIC Newsroom page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); 

    // --- Cookie/Consent Button Handling ---
    try {
      const closeBtn = await page.$('div.cmplz-close');
      if (closeBtn) {
        await closeBtn.click();
        console.log('Closed cookie banner.');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Replaced page.waitForTimeout
      }
    } catch (error) {
      console.log('No cookie banner (with selector "div.cmplz-close") found or an error occurred during interaction.');
    }
    // --- End Cookie/Consent Button Handling ---

    console.log('Waiting for filter checkboxes to be present...');
    try {
      await page.waitForSelector('div.sortOrderTopic input[type="checkbox"]', { timeout: 30000 });
      console.log('Filter checkboxes found.');
    } catch (error) {
      console.error('ERROR: Filters not found within timeout:', error.message);
      return; // Exit if filters are crucial and not found
    }

    const filterValues = ['129', '130', '131', '132']; // Example filter values from previous context
    console.log(`Applying filters: ${filterValues.join(', ')}`);
    for (const value of filterValues) {
      try {
        // Select checkbox by its value attribute within the specific filter div
        const checkbox = await page.$(`div.sortOrderTopic input[type="checkbox"][value="${value}"]`);
        if (checkbox) {
          const isChecked = await (await checkbox.getProperty('checked')).jsonValue();
          if (!isChecked) {
            await checkbox.click();
            console.log(`- Clicked filter checkbox for value: ${value}`);
          } else {
            console.log(`- Filter checkbox for value: ${value} was already checked.`);
          }
        } else {
          console.warn(`- Warning: Checkbox with value="${value}" not found.`);
        }
      } catch (error) {
        console.error(`ERROR: Error clicking filter ${value}:`, error.message);
      }
    }

    console.log('Filters applied. Waiting for filtered results to load...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Replaced page.waitForTimeout
    console.log('Finished waiting for filters to load.');

    // --- Show More Button Handling ---
    try {
      const showMoreButton = await page.$('button.showMoreCom'); // Selector from previous context
      if (showMoreButton) {
        await showMoreButton.click();
        console.log('Clicked "Show More" button.');
        await new Promise(resolve => setTimeout(resolve, 5000)); // Replaced page.waitForTimeout
      } else {
        console.log('No "Show More" button found.');
      }
    } catch (error) {
      console.error('ERROR: Error interacting with "Show More" button:', error.message);
    }
    // --- End Show More Button Handling ---


    console.log('Waiting for article list items to be displayed...');
    await page.waitForSelector('li[style="display: grid;"]', { timeout: 15000 });
    console.log('Article list items found. Starting scraping process.');

    const articles = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('li[style="display: grid;"]'));
      const seenUrls = new Set(); // For deduplication
      const results = [];

      items.forEach(item => {
        const linkEl = item.querySelector('h3 a');
        const titleEl = item.querySelector('h3 a'); // Title is within the same <a> tag
        const dateEl = item.querySelector('p.nr-date');

        const url = linkEl ? linkEl.href : null;
        const title = titleEl ? titleEl.textContent.trim() : null;

        let date = 'N/A';
        if (dateEl) {
          date = dateEl.textContent.trim();
          // Remove "Date: " prefix if present
          date = date.replace(/^Date:\s*/i, '');
        }

        if (title && url && !seenUrls.has(url)) { // Deduplicate by URL
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`[Browser Context] Found ${results.length} articles on listing page.`);
      return results.slice(0, 10); // Limit to first 10 articles as in previous versions
    });

    if (articles.length === 0) {
      console.warn('No articles found matching the specified criteria after scraping.');
    } else {
      console.log(`Successfully scraped ${articles.length} articles.`);
      console.log('\n--- Scraped Data Preview (First 5 Articles) ---');
      console.log(JSON.stringify(articles.slice(0, 5), null, 2));
      console.log('--- End Scraped Data Preview ---');
      
      const filename = 'asic_newsroom_articles.json';
      fs.writeFileSync(filename, JSON.stringify(articles, null, 2), 'utf8');
      console.log(`\nData successfully saved to ${filename} at: ${path.resolve(filename)}`);
    }

  } catch (err) {
    console.error('An unhandled error occurred during the main scraping process:', err.message);
    console.error(err); // Log the full error object for more details
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
}

// Run the main function when the script is executed
main();