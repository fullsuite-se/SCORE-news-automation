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
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list',
            '--disable-speech-api',
            '--disable-features=site-per-process'
        ],
        executablePath: executablePath,
      };
  let browser;

  const url = `https://denr.gov.ph/news-events-category/press-releases/`
  const articles = [];
  const maxArticles = 10;
  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    // Set a default timeout for navigation (e.g., 60 seconds)
    page.setDefaultNavigationTimeout(60000);

    // Optional: Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Handle cookie consent (OneTrust) similar to working local script
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
    await page.waitForSelector('div#main-content', { timeout: 15000 });
    await page.waitForFunction(() => {
        const container = document.querySelector('div#main-content');
        return !!container && container.querySelectorAll('div.press-releases-container').length > 0;
    }, { timeout: 20000 });
   
    //**REPLACE STARTING HERE**
    
    const scrapedData = await page.evaluate((maxArticles) => {
            const results = [];
            // Find all elements that represent an article container.
            // <--- REPLACE THIS SELECTOR with the actual article container selector
            const articleElements = document.querySelectorAll('div#main-content > div.three_fourth > div.press-releases-container');

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
                const titleElement = articleElement.querySelector('div.press-release-fr > div.news-title');
                const title = titleElement ? titleElement.innerText.trim() : 'N/A';

                // Extract Date
                // <--- REPLACE THIS SELECTOR
                const dateElement = articleElement.querySelector('div.news-date');
                const date = dateElement ? dateElement.innerText.trim() : 'N/A'

                // Extract Link
                // <--- REPLACE THIS SELECTOR
                const linkElement = articleElement.querySelector('div.press-release-fr > div.news-title > a');
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

    //**UNTIL HERE**
        
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