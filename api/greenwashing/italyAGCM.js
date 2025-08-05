const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  if (isVercelEnvironment) {
    const puppeteer = await import('@sparticuz/chromium');
    
    const executablePathValue = await ChromiumClass.executablePath();
    
    return {
      puppeteer: puppeteerExtra,
      launchOptions: {
        args: ChromiumClass.args,
        defaultViewport: ChromiumClass.defaultViewport,
        executablePath: executablePathValue,
        headless: 'new',
      }
    };
  } else {
    return {
      puppeteer,
      launchOptions: {
        headless: 'new',
        slowMo: 50,
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

export default async function handler(req, res) {
  let browser;
  const url = 'https://en.agcm.it/en/media/press-releases/';

  try {
    const { puppeteer, launchOptions } = await getBrowserModules();

    console.log('--- Puppeteer Launch Information ---');
    console.log('Is Vercel Environment:', isVercelEnvironment);
    console.log('Launch Options:', JSON.stringify(launchOptions, null, 2));
    console.log('--- End Launch Info ---');
    
    console.log('Attempting to launch Puppeteer browser...');
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const mainContainerSelector = 'div.table-responsive';
    console.log(`Waiting for main articles container: ${mainContainerSelector}...`);
    await page.waitForSelector(mainContainerSelector, { timeout: 15000 });
    console.log('Main articles container found. Proceeding to scrape individual articles.');

    const articles = await page.evaluate((baseUrl) => {
      const results = [];
      const seenUrls = new Set();
      const articleRows = document.querySelectorAll('div.table-responsive tbody tr');

      articleRows.forEach(row => {
        let title = null;
        let url = null;
        let date = 'N/A';

        const dateTd = row.querySelector('td:nth-child(1)');
        const titleLinkEl = row.querySelector('td:nth-child(2) a');

        if (dateTd) {
          date = dateTd.textContent.trim();
        }

        if (titleLinkEl) {
          title = titleLinkEl.textContent.trim();
          if (titleLinkEl.href) {
            url = new URL(titleLinkEl.href, baseUrl).href;
          }
        }

        if (title && url && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });
      return results;
    }, url);

    if (articles.length === 0) {
      console.warn('No articles found on the page matching the specified criteria after scraping.');
      return res.status(200).json({ success: true, message: 'No articles found', data: [] });
    }

    console.log(`Successfully scraped ${articles.length} articles.`);
    res.status(200).json({ success: true, data: articles });

  } catch (err) {
    console.error('An unhandled error occurred during the scraping process:', err.message);
    console.error(err);
    res.status(500).json({ success: false, error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}