
const isVercelEnvironment = !!process.env.AWS_REGION;
async function getBrowserModules() {
  if (isVercelEnvironment) {
    const puppeteer = await import('puppeteer-core');
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
    const puppeteer = await import('puppeteer');
    return {
      puppeteer,
      chromiumArgs: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'], 
      chromiumDefaultViewport: null, 
      executablePath: undefined 
    };
  }
}

/**
 *
 * @param {object} req
 * @param {object} res
 */
export default async function handler(req, res) {
  let browser; 
  const url = 'https://bbbprograms.org/search?searchTerm=environmental&sortresultsby=newest&page=0&mediaTypes=%2FEducation-and-Resources%2Fnewsroom%2FDescisions%2F&resultsTotal=0#National+Advertising+Division+%28NAD%29';

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

    // Define Puppeteer launch options
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

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('Waiting for articles selector (div.site-search__results-items article header)...');
    await page.waitForSelector('div.site-search__results-items article header', { timeout: 15000 });

    console.log('Scraping articles...');
    const articles = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('div.site-search__results-items article header'));
      const results = [];
      const seenUrls = new Set(); 

      headers.slice(0, 10).map(header => { 
        const linkEl = header.querySelector('h3 a');
        const paraEl = header.querySelector('p');

        const title = linkEl ? linkEl.textContent.trim() : null;
        const url = linkEl ? linkEl.href : null;

        let date = 'N/A';
        if (paraEl) {
          const text = paraEl.textContent.trim();
          const match = text.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/);
          if (match && match[0]) {
            date = match[0];
          }
        }

        if (title && url && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`Found ${results.length} articles on listing page.`); 
      return results;
    });

    if (articles.length === 0) {
      console.log('No articles found.');
      return res.status(200).json({
        success: true,
        message: 'No articles found with the specified selectors.',
        data: []
      });
    } else {
      console.log(`Successfully scraped ${articles.length} articles.`);
      return res.status(200).json({
        success: true,
        data: articles
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