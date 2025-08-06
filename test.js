import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(stealthPlugin());

const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  if (isVercelEnvironment) {
    const { default: ChromiumClass } = await import('@sparticuz/chromium');
    
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
      puppeteer: puppeteerExtra,
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
  const url = 'https://konsument.at/greenwashing-check'; 

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

    const acceptButtonSelector = 'div.cc-overlay-footer button#accept.cc-overlay-button.cc-overlay-yes';
    console.log(`Waiting for cookie consent button: ${acceptButtonSelector}...`);
    try {
      await page.waitForSelector(acceptButtonSelector, { timeout: 10000 });
      console.log('Cookie consent button found. Attempting to click...');
      await page.click(acceptButtonSelector);
      console.log('Cookie consent button clicked.');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (cookieError) {
      console.warn(`Warning: Cookie consent button not found or clickable within timeout. Proceeding without clicking. Details: ${cookieError.message}`);
    }

    const mainContainerSelector = 'div.view-content';
    console.log(`Waiting for main articles container: ${mainContainerSelector}...`);
    await page.waitForSelector(mainContainerSelector, { timeout: 15000 });
    console.log('Main articles container found. Proceeding to scrape titles, URLs, and dates.');

    const articles = await page.evaluate((baseUrl) => {
      const results = [];
      const seenUrls = new Set();
      const articleContainers = document.querySelectorAll('div.views-row article.grid.col-2');

      articleContainers.forEach(container => {
        let title = null;
        let url = null;
        let date = 'N/A';
        
        const titleEl = container.querySelector('h3');
        const linkEl = container.querySelector('h3 a');
        const dateEl = container.querySelector('span.meta time');

        if (titleEl) {
          title = titleEl.textContent.trim();
        }

        if (linkEl && linkEl.href) {
          url = new URL(linkEl.href, baseUrl).href;
        }

        if (dateEl) {
          date = dateEl.textContent.trim();
        }

        if (title && url && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });

      console.log(`[Browser Context] Found ${results.length} articles on the page.`);
      return results;
    }, url);

    if (articles.length === 0) {
      console.warn('No articles found on the page matching the specified criteria after scraping.');
      return res.status(200).json({ success: true, message: 'No articles found', data: [] });
    }

    console.log(`Successfully scraped ${articles.length} articles.`);
    res.status(200).json({articles});

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