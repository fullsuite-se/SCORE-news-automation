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
  const url = 'https://www.asic.gov.au/newsroom/search/?tag=sustainable%20finance';

  try {
    const { puppeteer, chromiumArgs, chromiumDefaultViewport, executablePath } = await getBrowserModules();

    console.log('--- Puppeteer Launch Information ---');
    console.log('Is Vercel Environment:', isVercelEnvironment);
    console.log('Chromium Args:', chromiumArgs);
    console.log('Chromium Default Viewport:', chromiumDefaultViewport);
    console.log('Executable Path:', executablePath);
    console.log('--- End Launch Info ---');
    
    console.log('Attempting to launch Puppeteer browser...');
    const launchOptions = isVercelEnvironment
      ? {
          args: chromiumArgs,
          defaultViewport: chromiumDefaultViewport,
          executablePath: executablePath,
          headless: 'new',
        }
      : {
          headless: 'new',
          slowMo: 50,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        };
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log(`Navigating to ASIC Newsroom search results: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const articleListContainerSelector = 'ul#nr-list';
    console.log(`Waiting for individual article items to load: ${articleListContainerSelector} li...`);
    try {
      await page.waitForSelector(`${articleListContainerSelector} li`, { timeout: 30000 });
      console.log('Individual article items found. Starting scraping process.');
    } catch (error) {
      console.error('ERROR: No article items found within timeout:', error.message);
      return res.status(500).json({ success: false, error: 'Scraping failed: Article items not found.' });
    }

    const articles = await page.evaluate((listContainerSel) => {
      const items = Array.from(document.querySelectorAll(`${listContainerSel} li`));
      const results = [];

      items.forEach(item => {
        let title = null;
        let url = null;
        let date = null;

        const linkEl = item.querySelector('h3 a');
        if (linkEl) {
          title = linkEl.textContent.trim();
          url = new URL(linkEl.href, window.location.origin).href;
        }

        const dateEl = item.querySelector('p.nr-date');
        if (dateEl) {
          date = dateEl.textContent.trim();
          date = date.replace(/^Date:\s*/i, '');
        }

        if (title && url && date) {
          results.push({ title, url, date });
        }
      });
      console.log(`[Browser Context] Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
    }, articleListContainerSelector);

    if (articles.length === 0) {
      console.warn('No articles found.');
      return res.status(200).json({ message: 'No articles found' });
    }

    console.log(`Successfully scraped ${articles.length} articles.`);
    res.status(200).json(articles);

  } catch (err) {
    console.error('An unhandled error occurred during the scraping process:', err.message);
    console.error(err);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}