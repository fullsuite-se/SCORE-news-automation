

// This is a reliable way to check if the script is running in the Vercel environment.
const isVercelEnvironment = !!process.env.AWS_REGION;

/**
 * Dynamically imports and configures Puppeteer based on the environment.
 * @returns {object} An object containing the Puppeteer instance and its launch options.
 */
async function getBrowserModules() {
  if (isVercelEnvironment) {
    // Vercel Environment: Use puppeteer-core and the serverless chromium.
    const puppeteer = await import('@sparticuz/chromium');
    
    // Get the executable path from @sparticuz/chromium
    const executablePathValue = await ChromiumClass.executablePath();
    
    return {
      puppeteer, // puppeteer-extra will use puppeteer-core on Vercel
      launchOptions: {
        args: ChromiumClass.args,
        defaultViewport: ChromiumClass.defaultViewport,
        executablePath: executablePathValue,
        headless: 'new', // Must be 'new' for serverless functions
      }
    };
  } else {
    // Local Environment: Use local puppeteer installation with optional debug features.
    return {
      puppeteer,
      launchOptions: {
        headless: 'new', // Use "new" headless mode for consistency and performance
        slowMo: 50,      // Slows down Puppeteer operations by 50ms for visual debugging
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
        ],
      }
    };
  }
}

/**
 * Vercel serverless function handler. This is the entry point for the function.
 * @param {object} req - The Vercel request object.
 * @param {object} res - The Vercel response object.
 */
export default async function handler(req, res) {
  let browser;
  const url = 'https://www.ascionline.in/complaint-outcomes/';

  try {
    // Get the configured Puppeteer instance and launch options based on the environment
    const { puppeteer, launchOptions } = await getBrowserModules();

    console.log('--- Puppeteer Launch Information ---');
    console.log('Is Vercel Environment:', isVercelEnvironment);
    console.log('Launch Options:', JSON.stringify(launchOptions, null, 2));
    console.log('--- End Launch Info ---');
    
    console.log('Attempting to launch Puppeteer browser...');
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log('Navigating to ASCI Complaint Outcomes page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); 

    // --- Cookie/Consent Button Handling ---
    try {
      const closeBtn = await page.$('div.cmplz-close');
      if (closeBtn) {
        await closeBtn.click();
        console.log('Closed cookie banner.');
        await new Promise(resolve => setTimeout(resolve, 1000)); 
      }
    } catch (error) {
      console.log('No cookie banner (with selector "div.cmplz-close") found or an error occurred during interaction.');
    }
    // --- End Cookie/Consent Button Handling ---

    const articleListContainerSelector = 'ul.searchBarCon_ul.searchBarCon_ul_comOutcome';
    console.log(`Waiting for article list container: ${articleListContainerSelector}...`);
    try {
      await page.waitForSelector(articleListContainerSelector, { timeout: 15000 });
      console.log('Article list container found.');
    } catch (error) {
      console.error('ERROR: Article list container not found within timeout:', error.message);
      // Return a 500 status if the main container is crucial and not found
      return res.status(500).json({ success: false, error: 'Scraping failed: Article list container not found.' });
    }

    console.log('Waiting for filter checkboxes to be present...');
    try {
      await page.waitForSelector('div.sortOrderTopic input[type="checkbox"]', { timeout: 30000 });
      console.log('Filter checkboxes found.');
    } catch (error) {
      console.error('ERROR: Filters not found within timeout:', error.message);
      // Return a 500 status if filters are crucial and not found
      return res.status(500).json({ success: false, error: 'Scraping failed: Filters not found.' });
    }

    const filterValues = ['129', '130', '131', '132'];
    console.log(`Applying filters: ${filterValues.join(', ')}`);
    for (const value of filterValues) {
      try {
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
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('Finished waiting for filters to load.');

    // --- Show More Button Handling ---
    try {
      const showMoreButton = await page.$('button.showMoreCom');
      if (showMoreButton) {
        await showMoreButton.click();
        console.log('Clicked "Show More" button.');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.log('No "Show More" button found.');
      }
    } catch (error) {
      console.error('ERROR: Error interacting with "Show More" button:', error.message);
    }
    // --- End Show More Button Handling ---

    console.log('Starting scraping process within the article list container.');
    const articles = await page.evaluate((listContainerSel) => {
      const items = Array.from(document.querySelectorAll(`${listContainerSel} li`));
      const seenUrls = new Set();
      const results = [];

      items.forEach(item => {
        const linkEl = item.querySelector('p.comOutcomeTitle a');
        const titleEl = item.querySelector('p.comOutcomeTitle');
        const spanlineP = item.querySelector('p.spanline');
        const spanlineSpans = spanlineP ? spanlineP.querySelectorAll('span') : [];

        const url = linkEl ? linkEl.href : null;
        const title = titleEl ? titleEl.textContent.trim() : null;

        let date = 'N/A';
        if (spanlineSpans.length >= 3) {
          date = spanlineSpans[2].textContent.trim();
        }

        if (title && url && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`[Browser Context] Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
    }, articleListContainerSelector);

    if (articles.length === 0) {
      console.warn('No articles found matching the specified criteria after scraping.');
      return res.status(200).json({ success: true, message: 'No articles found', data: [] });
    }

    console.log(`Successfully scraped ${articles.length} articles.`);
    return res.status(200).json({ success: true, data: articles });

  } catch (err) {
    console.error('An unhandled error occurred during the main scraping process:', err.message);
    console.error(err);
    return res.status(500).json({ success: false, error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}