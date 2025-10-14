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
    
    // Set longer timeouts for serverless environment
    page.setDefaultNavigationTimeout(120000); // 2 minutes
    page.setDefaultTimeout(120000); // 2 minutes for all operations

    // Optional: Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('Navigating to URL:', url);
    
    // Try different wait strategies for serverless environment
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
        console.log('Page loaded with networkidle2');
    } catch (error) {
        console.log('networkidle2 failed, trying domcontentloaded:', error.message);
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
            console.log('Page loaded with domcontentloaded');
            // Wait a bit more for dynamic content
            await page.waitForTimeout(5000);
        } catch (error2) {
            console.log('domcontentloaded failed, trying load:', error2.message);
            await page.goto(url, { waitUntil: 'load', timeout: 120000 });
            console.log('Page loaded with load');
            // Wait more for dynamic content
            await page.waitForTimeout(10000);
        }
    }
    
    console.log('Page loaded successfully');
    
    // Handle cookie consent (OneTrust) similar to working local script
    const acceptButtonSelector = 'button#onetrust-accept-btn-handler';
    const cookieBannerSelector = 'div.ot-sdk-container';
    try {
        console.log('Looking for cookie banner...');
        await page.waitForSelector(acceptButtonSelector, { visible: true, timeout: 10000 });
        console.log('Cookie banner found, clicking accept...');
        await page.click(acceptButtonSelector);
        await page.waitForSelector(cookieBannerSelector, { hidden: true, timeout: 10000 });
        console.log('Cookie banner dismissed, reloading page...');
        // Reload after accepting cookies to ensure content loads
        await page.reload({ waitUntil: 'networkidle2', timeout: 120000 });
    } catch (error) {
        console.log('No cookie banner found or error handling cookies:', error.message);
        // No cookie banner or it disappeared; continue
    }

    // Wait for the container and ensure results are populated (site loads via JS)
    console.log('Waiting for main content container...');
    try {
        await page.waitForSelector('div#main-content', { timeout: 30000 });
        console.log('Main content container found');
        
        console.log('Waiting for press releases to load...');
        await page.waitForFunction(() => {
            const container = document.querySelector('div#main-content');
            return !!container && container.querySelectorAll('div.press-releases-container').length > 0;
        }, { timeout: 45000 });
        console.log('Press releases loaded successfully');
    } catch (error) {
        console.error('Error waiting for content to load:', error.message);
        // Try to continue anyway and see what we can scrape
        console.log('Attempting to scrape with whatever content is available...');
        
        // Additional fallback: wait for any content to appear and then proceed
        try {
            console.log('Waiting for any content to appear...');
            await page.waitForFunction(() => {
                const body = document.body;
                return body && body.innerHTML.length > 1000; // Wait for substantial content
            }, { timeout: 20000 });
            console.log('Content appears to be loaded, proceeding with scraping...');
        } catch (fallbackError) {
            console.log('Fallback wait also failed, proceeding anyway:', fallbackError.message);
        }
    }
   
    //**SCRAPING SECTION**
    
    console.log('Starting to scrape articles...');
    const scrapedData = await page.evaluate((maxArticles) => {
            const results = [];
            // Find all elements that represent an article container.
            // <--- REPLACE THIS SELECTOR with the actual article container selector
            const articleElements = document.querySelectorAll('div#main-content > div.three_fourth > div.press-releases-container');

            if (articleElements.length === 0) {
                console.warn("DIAGNOSTIC (Inner): No article elements found with the specified main selector.");
                console.warn("DIAGNOSTIC (Inner): Checking for alternative selectors...");
                
                // Try alternative selectors as fallback
                const altSelectors = [
                    'div#main-content div.press-releases-container',
                    'div.press-releases-container',
                    'div#main-content .press-release',
                    'div#main-content article',
                    'div#main-content .news-item'
                ];
                
                let foundElements = null;
                for (const selector of altSelectors) {
                    foundElements = document.querySelectorAll(selector);
                    if (foundElements.length > 0) {
                        console.log(`DIAGNOSTIC (Inner): Found ${foundElements.length} elements with alternative selector: ${selector}`);
                        break;
                    }
                }
                
                if (!foundElements || foundElements.length === 0) {
                    console.warn("DIAGNOSTIC (Inner): No elements found with any selector. Page content:");
                    console.warn("DIAGNOSTIC (Inner): Main content HTML:", document.querySelector('div#main-content')?.innerHTML?.substring(0, 500) || 'No main content found');
                    return [];
                }
                
                // Use the found elements
                for (let i = 0; i < Math.min(foundElements.length, maxArticles); i++) {
                    const articleElement = foundElements[i];
                    
                    // Try multiple selectors for each field
                    const titleSelectors = [
                        'div.press-release-fr > div.news-title',
                        '.news-title',
                        'h2, h3, h4',
                        'a[href*="/news-events/"]'
                    ];
                    
                    const dateSelectors = [
                        'div.news-date',
                        '.news-date',
                        '.date',
                        '[class*="date"]'
                    ];
                    
                    const linkSelectors = [
                        'div.press-release-fr > div.news-title > a',
                        '.news-title a',
                        'a[href*="/news-events/"]',
                        'a'
                    ];
                    
                    let title = 'N/A';
                    let date = 'N/A';
                    let link = 'N/A';
                    
                    // Find title
                    for (const selector of titleSelectors) {
                        const element = articleElement.querySelector(selector);
                        if (element && element.innerText.trim()) {
                            title = element.innerText.trim();
                            break;
                        }
                    }
                    
                    // Find date
                    for (const selector of dateSelectors) {
                        const element = articleElement.querySelector(selector);
                        if (element && element.innerText.trim()) {
                            date = element.innerText.trim();
                            break;
                        }
                    }
                    
                    // Find link
                    for (const selector of linkSelectors) {
                        const element = articleElement.querySelector(selector);
                        if (element && element.getAttribute('href')) {
                            try {
                                link = new URL(element.getAttribute('href'), window.location.origin).href;
                                break;
                            } catch (e) {
                                link = element.getAttribute('href');
                            }
                        }
                    }

                    if (title !== 'N/A' || link !== 'N/A') {
                        results.push({
                            title: title,
                            url: link,
                            date: date,
                        });
                    }
                }
                
                return results;
            } else {
                console.log(`DIAGNOSTIC (Inner): Found ${articleElements.length} potential article elements.`);
            }

            for (let i = 0; i < Math.min(articleElements.length, maxArticles); i++) {
                const articleElement = articleElements[i];

                // Extract Title
                const titleElement = articleElement.querySelector('div.press-release-fr > div.news-title');
                const title = titleElement ? titleElement.innerText.trim() : 'N/A';

                // Extract Date
                const dateElement = articleElement.querySelector('div.news-date');
                const date = dateElement ? dateElement.innerText.trim() : 'N/A'

                // Extract Link
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

        console.log(`Scraped ${scrapedData.length} articles`);
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