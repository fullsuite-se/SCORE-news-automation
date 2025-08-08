const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  await import('puppeteer-extra-plugin-stealth/evasions/chrome.app/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/chrome.csi/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/chrome.loadTimes/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/chrome.runtime/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/defaultArgs/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/iframe.contentWindow/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/media.codecs/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.hardwareConcurrency/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.languages/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.permissions/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.plugins/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.vendor/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.webdriver/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/sourceurl/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/user-agent-override/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/webgl.vendor/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/window.outerdimensions/index.js');

  const puppeteer = (await import('puppeteer-extra')).default;
  // stealth plugin to hide puppeteer
  const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
  puppeteer.use(StealthPlugin());

  const UserPreferencesPlugin = (await import('puppeteer-extra-plugin-user-preferences')).default;
  puppeteer.use(UserPreferencesPlugin());
  const UserDataDirPlugin = (await import('puppeteer-extra-plugin-user-data-dir')).default;
  puppeteer.use(UserDataDirPlugin());
  
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
    // executablePathValue = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else {
    executablePathValue = ChromiumClass.executablePath;
    // executablePathValue = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  console.log('EXECUTABLE PATH VALUE: ', executablePathValue);
  return {
    puppeteer,
    chromiumArgs: ChromiumClass.args,
    chromiumDefaultViewport: ChromiumClass.defaultViewport,
    executablePath: executablePathValue
  };
}
export default async function (req, res) {
  const { puppeteer, chromiumArgs, chromiumDefaultViewport, executablePath } = await getBrowserModules();
  console.log('--- Puppeteer Launch Debug Info (Vercel) ---');
  console.log('isVercelEnvironment:', isVercelEnvironment);
  console.log('chromiumArgs (from @sparticuz/chromium):', chromiumArgs);
  console.log('chromiumDefaultViewport (from @sparticuz/chromium):', chromiumDefaultViewport);
  console.log('Executable Path (from @sparticuz/chromium):', executablePath);
  console.log('--- End Debug Info (Vercel) ---');
  if (isVercelEnvironment && (!executablePath || typeof executablePath !== 'string' || executablePath.trim() === '')) {
    console.error('ERROR: In Vercel environment, executablePath is not valid:', executablePath);
    return res.status(500).json({
      error: 'Puppeteer launch failed: Missing or invalid Chromium executable path for Vercel environment.'
    });
  }
  const launchOptions = isVercelEnvironment
    ? {
        args: chromiumArgs,
        defaultViewport: chromiumDefaultViewport,
        executablePath: executablePath,
        headless: "new", // Must be true for serverless environments
      }
    : {
        headless: "new", // Set to true for consistency, or false for local visual debugging
        defaultViewport: null,
        slowMo: 50,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        executablePath: executablePath,
      };
  let browser;

  const url = `https://www.labour.gov.za/Media-Desk/Media-Statements/Pages/media-statements.aspx`
  const articles = [];
  const maxArticles = 10;
  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
   
    //**REPLACE STARTING HERE**
    
    const dateGroupingItemSelector = 'ul.gsc-excerpt-list > li.gsc-excerpt-list__item';
    const minExpectedDateGroups = 1; // At least one date group should be present

    console.log(`DIAGNOSTIC (Outer): Waiting for at least ${minExpectedDateGroups} date grouping items to be present using waitForFunction...`);
    await page.waitForFunction(
      (selector, minCount) => document.querySelectorAll(selector).length >= minCount,
      { timeout: 60000 }, // Max wait time
      dateGroupingItemSelector,
      minExpectedDateGroups
    );
    console.log(`DIAGNOSTIC (Outer): At least ${minExpectedDateGroups} date grouping items are now present on the page.`);
        
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
        
    if (articles.length === 0) {
      console.log('No articles found!');
      return res.status(200).json({ message: 'No articles found' });
    }
    console.log(`Returning ${articles.length} articles.`);
    res.status(200).json(articles);
  } catch (err) {
    console.error('Error during scraping:', err.message);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}