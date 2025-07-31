
const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  if (isVercelEnvironment) {
    const puppeteer = (await import('puppeteer-core')).default;
    const { default: ChromiumClass } = await import('@sparticuz/chromium');

    console.log('--- Debugging ChromiumClass object (Vercel Environment) ---');
    console.log('Type of ChromiumClass:', typeof ChromiumClass);
    console.log('ChromiumClass.executablePath is a function:', typeof ChromiumClass.executablePath === 'function');
    console.log('ChromiumClass.args:', ChromiumClass.args);
    console.log('ChromiumClass.defaultViewport:', ChromiumClass.defaultViewport);
    console.log('--- End ChromiumClass Debug (Vercel Environment) ---');

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
  } else {
    const puppeteer = (await import('puppeteer')).default;
    return {
      puppeteer,
      chromiumArgs: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'], 
      chromiumDefaultViewport: null, 
      executablePath: undefined 
    };
  }
}

export default async function handler(req, res) {
  let browser; 
  const url = 'https://www.consilium.europa.eu/en/press/press-releases/?keyword=&DateFrom=&DateTo=&Topic=122254&Topic=122124&Topic=122161&Topic=122178';

  try {
    const { puppeteer, chromiumArgs, chromiumDefaultViewport, executablePath } = await getBrowserModules();

    console.log('--- Puppeteer Launch Debug Info ---');
    console.log('Is Vercel Environment:', isVercelEnvironment);
    console.log('Chromium Args:', chromiumArgs);
    console.log('Chromium Default Viewport:', chromiumDefaultViewport);
    console.log('Executable Path:', executablePath);
    console.log('--- End Debug Info ---');

    if (isVercelEnvironment && (!executablePath || typeof executablePath !== 'string' || executablePath.trim() === '')) {
      console.error('ERROR: In Vercel environment, executablePath is not valid:', executablePath);
      return res.status(500).json({
        success: false,
        error: 'Puppeteer launch failed: Missing or invalid Chromium executable path for Vercel environment.'
      });
    }

    const launchOptions = isVercelEnvironment
      ? {
          args: chromiumArgs,           
          defaultViewport: chromiumDefaultViewport, 
          executablePath: executablePath, 
          headless: true,               
        }
      : {
          headless: true,               
          defaultViewport: null,        
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'], 
        };

    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log('Navigating to Consilium page...');
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });

    // Handle cookie banner
    try {
      console.log('Checking for cookie banner...');
      await page.waitForSelector('#cookie-banner button[data-dismiss="cookie-banner"]', { timeout: 5000 });
      await page.click('#cookie-banner button[data-dismiss="cookie-banner"]');
      console.log('Cookie banner accepted.');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Standard delay
    } catch (e) {
      console.log('No cookie banner found or failed to click:', e.message);
    }

    console.log('Waiting for article items...');
    await page.waitForSelector('li.gsc-excerpt__item', { timeout: 15000 });
    console.log('Article items found.');

    console.log('Scraping articles...');
    const articlesData = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('li.gsc-excerpt__item'));
      const results = [];

      // Complex date extraction logic from original script
      articles.slice(0, 10).forEach(articleEl => { // Limit to 10 articles
        const titleEl = articleEl.querySelector('a.gsc-excerpt-item__title');
        const timeEl = articleEl.querySelector('time.gsc-date__date');

        const title = titleEl?.textContent?.trim() || null;
        const href = titleEl?.getAttribute('href') || null;
        const timeText = timeEl?.textContent?.trim() || null;

        let fullDate = '';
        let el = articleEl.previousElementSibling;
        while (el) {
          if (el.tagName === 'H2' && el.classList.contains('gsc-excerpt-list__item-date')) {
            fullDate = el.textContent.trim();
            break;
          }
          el = el.previousElementSibling;
        }
        
        // Fallback if previousElementSibling didn't find it (original logic)
        if (!fullDate) {
            let parent = articleEl.parentElement;
            while (parent) {
                const siblings = Array.from(parent.parentElement ? parent.parentElement.children : []);
                const idx = siblings.indexOf(parent);
                for (let i = idx - 1; i >= 0; i--) {
                    const sibling = siblings[i];
                    if (sibling.tagName === 'H2' && sibling.classList.contains('gsc-excerpt-list__item-date')) {
                        fullDate = sibling.textContent.trim();
                        break;
                    }
                }
                if (fullDate) break;
                parent = parent.parentElement;
            }
        }

        const publishedAt = fullDate ? `${fullDate} ${timeText}` : timeText;
        // Ensure full URL
        const fullUrl = href ? new URL(href, 'https://www.consilium.europa.eu').href : null;

        if (title && fullUrl) {
          results.push({ title, publishedAt, url: fullUrl });
        }
      });
      console.log(`Found ${results.length} articles on the page.`);
      return results;
    });

    if (articlesData.length === 0) {
      console.log('No articles found.');
      return res.status(200).json({ 
        success: true,
        message: 'No articles found with the specified selectors.', 
        data: [] 
      });
    } else {
      console.log(`Successfully scraped ${articlesData.length} articles.`);
      return res.status(200).json({
        success: true,
        data: articlesData
      });
    }

  } catch (err) {
    console.error('Error during scraping:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Scraping failed', 
      details: err.message || 'An unknown error occurred during scraping.' 
    });
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
}