const isVercelEnvironment = !!process.env.AWS_REGION; 

/**
 * Dynamically imports puppeteer-core and @sparticuz/chromium.
 * This function ensures the correct executable path is used for a headless
 * Chromium browser in serverless environments.
 * @returns {Promise<{puppeteer: object, chromiumArgs: string[], chromiumDefaultViewport: object, executablePath: string|null}>}
 */
async function getBrowserModules() {
  const puppeteer = await import('puppeteer-core');
  const { default: ChromiumClass } = await import('@sparticuz/chromium');

  console.log('--- Debugging ChromiumClass object (Vercel) ---');
  console.log('Type of ChromiumClass:', typeof ChromiumClass);
  console.log('Keys of ChromiumClass:', Object.keys(ChromiumClass));
  console.log('Full ChromiumClass object:', ChromiumClass);
  console.log('ChromiumClass.executablePath is a function:', typeof ChromiumClass.executablePath === 'function');
  console.log('ChromiumClass.args:', ChromiumClass.args);
  console.log('ChromiumClass.defaultViewport:', ChromiumClass.defaultViewport);
  console.log('--- End ChromiumClass Debug (Vercel) ---');

  let executablePathValue = null;
  if (typeof ChromiumClass.executablePath === 'function') {
    executablePathValue = await ChromiumClass.executablePath();
  } else {
    executablePathValue = ChromiumClass.executablePath;
  }

  return {
    puppeteer,
    chromiumArgs: ChromiumClass.args,
    chromiumDefaultViewport: ChromiumClass.defaultViewport,
    executablePath: executablePathValue
  };
}

/**
 * Vercel Serverless Function for scraping articles from The Straits Times Climate Change section.
 * This function fetches article titles, URLs, and publication dates.
 * It's designed to be invoked via an HTTP request.
 * @param {object} req - The Vercel request object.
 * @param {object} res - The Vercel response object.
 */
export default async function (req, res) {
  // Retrieve Puppeteer and Chromium configuration from the helper function.
  const { puppeteer, chromiumArgs, chromiumDefaultViewport, executablePath } = await getBrowserModules();

  // --- Crucial Debugging and Validation for Vercel ---
  console.log('--- Puppeteer Launch Debug Info (Vercel) ---');
  console.log('isVercelEnvironment:', isVercelEnvironment);
  console.log('chromiumArgs (from @sparticuz/chromium):', chromiumArgs);
  console.log('chromiumDefaultViewport (from @sparticuz/chromium):', chromiumDefaultViewport);
  console.log('Executable Path (from @sparticuz/chromium):', executablePath);
  console.log('--- End Debug Info (Vercel) ---');

  // Validate that a valid executablePath is available when in a serverless environment.
  if (isVercelEnvironment && (!executablePath || typeof executablePath !== 'string' || executablePath.trim() === '')) {
    console.error('ERROR: In Vercel environment, executablePath is not valid:', executablePath);
    return res.status(500).json({
      error: 'Puppeteer launch failed: Missing or invalid Chromium executable path for Vercel environment.',
      details: 'Ensure @sparticuz/chromium is correctly integrated and can locate the Chromium binary.'
    });
  }

  // Configure Puppeteer launch options based on the environment.
  const launchOptions = isVercelEnvironment
    ? {
        args: chromiumArgs, 
        defaultViewport: chromiumDefaultViewport, 
        executablePath: executablePath, 
        headless: true, 
      }
    : {
        
        headless: true, 
        slowMo: 50, 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'], 
      };

  let browser; 
  const baseUrl = 'https://www.straitstimes.com';
  const url = `${baseUrl}/tags/climate-change`; // Target URL for scraping.

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions); // Launch the browser instance.
    const page = await browser.newPage();

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); // Navigate to the URL.

    // Wait for the main content selector using XPath to ensure elements are loaded.
    // This XPath might be fragile; consider a CSS selector if possible.
    await page.waitForSelector('xpath=/html/body/div[5]/div/div[1]/main/div/div[1]/div/a[1]', { timeout: 15000 });

    const articleElements = [];
    // Loop to select up to 10 article link elements using XPath.
    // XPath selectors can be brittle if the page structure changes frequently.
    for (let j = 0; j < 10; j++) {
      const xpath = `xpath=/html/body/div[5]/div/div[1]/main/div/div[1]/div/a[${j + 1}]`;
      const elements = await page.$$(xpath); // Use $$ to find all elements matching XPath.
      if (elements.length > 0) {
        articleElements.push(elements[0]); // Add the first matching element.
      } else {
        // If an element is not found, it implies we've reached the end of available articles or an index issue.
        break;
      }
    }

    if (articleElements.length === 0) {
      console.log('No articles found on the listing page.');
      return res.status(200).json({ message: 'No articles found' });
    }

    const articles = []; // Array to store detailed article information.

    // Iterate through the collected article elements to extract details.
    for (let i = 0; i < articleElements.length; i++) {
      // Extract title using a data-testid selector.
      const title = await page.evaluate(el => {
        const titleElement = el.querySelector('[data-testid="subsection-title"]');
        return titleElement ? titleElement.textContent.trim() : '';
      }, articleElements[i]);

      // Extract the relative URL from the anchor tag.
      const relativeUrl = await page.evaluate(el => el.getAttribute('href'), articleElements[i]);
      const fullUrl = `${baseUrl}${relativeUrl}`; // Construct the full URL.

      const newPage = await browser.newPage(); // Open a new page for each article for detailed scraping.

      try {
        console.log(`Navigating to article: ${fullUrl}`);
        // Navigate to the individual article URL.
        await newPage.goto(fullUrl, {
          waitUntil: 'networkidle2', // Wait until network is idle.
          timeout: 30000
        });

        // Wait for the date element selector using XPath.
        await newPage.waitForSelector('xpath=/html/body/div[5]/div[1]/main/div[1]/article/section[1]/div[3]/div[1]', { timeout: 15000 });
        const dateElement = await newPage.$('xpath=/html/body/div[5]/div[1]/main/div[1]/article/section[1]/div[3]/div[1]');

        let date = '';
        if (dateElement) {
          date = await newPage.evaluate(el => el.textContent.trim(), dateElement);
        } else {
            console.warn(`Date element not found for article: ${fullUrl}`);
        }

        articles.push({
          title,
          date,
          url: fullUrl
        });

      } catch (error) {
        // Log errors encountered while processing an individual article.
        console.error(`Error processing article ${i + 1} (${fullUrl}): ${error.message}`);
        articles.push({
          title,
          date: '', // Provide empty date on error.
          url: fullUrl
        });
      } finally {
        await newPage.close(); // Ensure the article page is closed.
      }
    }

    // Deduplicate articles by title (as per your original script).
    const seenTitles = new Set();
    const deduplicated = articles.filter(article => {
      if (seenTitles.has(article.title)) return false;
      seenTitles.add(article.title);
      return true;
    });

    // Send the scraped and deduplicated articles as a JSON response.
    res.status(200).json(deduplicated);

  } catch (error) {
    // Catch any errors during the main scraping process or Puppeteer launch.
    console.error('An error occurred during scraping or Puppeteer launch:', error.message);
    // Send a 500 Internal Server Error response.
    res.status(500).json({ error: 'Scraping failed', details: error.message });
  } finally {
    // Ensure the browser is closed even if an error occurs.
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}
