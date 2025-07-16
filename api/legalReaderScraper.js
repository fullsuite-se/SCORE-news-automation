// pages/api/scrape-legalreader.js

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
  const url = 'https://www.legalreader.com/lawsuits-litigation/';

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

    console.log('Navigating to Legal Reader Lawsuits & Litigation page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); 

    console.log('Waiting for article containers...');
    await page.waitForSelector('div.col-md-8', { timeout: 15000 });
    console.log('Article containers found.');

    console.log('Scraping articles...');
    const articles = await page.evaluate(() => {
      const containers = document.querySelectorAll('div.col-md-8');
      const seen = new Set();
      const results = [];

      Array.from(containers).slice(0, 10).forEach(div => { 
        const titleTag = div.querySelector('h2.post-title a');
        const dateTag = div.querySelector('span.byline span.date');

        if (!titleTag) return; 

        const url = titleTag.href;
        const title = titleTag.textContent.trim();
        const date = dateTag ? dateTag.textContent.trim() : 'Date not found';

        if (!seen.has(url)) {
          seen.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`Found ${results.length} articles on the page.`);
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