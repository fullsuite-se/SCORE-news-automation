// pages/api/scrape-justia-news.js

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
  const url = 'https://news.justia.com/';

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

    console.log('Navigating to Justia News...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); 

    console.log('Waiting for article selectors...');
    await page.waitForSelector('div.inner-wrapper.entry[itemprop="blogPost"], p.supreme-content', { timeout: 15000 }); 
    console.log('Article containers found.');

    console.log('Scraping articles...');
    const articles = await page.evaluate(() => {
      const seen = new Set();
      const results = [];

      const internalNodes = document.querySelectorAll('div.inner-wrapper.entry[itemprop="blogPost"]');
      internalNodes.forEach(node => {
        const anchor = node.querySelector('a[href]');
        const titleTag = node.querySelector('strong.heading-5[itemprop="name"]');
        const timeTag = node.querySelector('time.post-date.published');

        if (!anchor || !titleTag || !timeTag) return;

        const url = anchor.href;
        const title = titleTag.innerText.trim();
        const date = timeTag.textContent.trim();

        if (!seen.has(url)) {
          seen.add(url);
          results.push({ title, url, date });
        }
      });

      const externalNodes = document.querySelectorAll('p.supreme-content');
      externalNodes.forEach(p => {
        const anchor = p.querySelector('a[href][target="_blank"]');
        const spans = p.querySelectorAll('span');

        if (!anchor || spans.length < 2) return;

        const url = anchor.href;
        const title = anchor.innerText.trim();
        const date = spans[1].innerText.trim();

        if (!seen.has(url)) {
          seen.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`Found ${results.length} raw articles. Returning first 10.`);
      return results.slice(0, 10); 
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