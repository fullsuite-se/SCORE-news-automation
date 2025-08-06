import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(stealthPlugin());

const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  if (isVercelEnvironment) {
    const { default: ChromiumClass } = await import('@sparticuz/chromium');
    
    const executablePathValue = await ChromiumClass.executablePath();
    
    return {
      puppeteer: puppeteerExtra, // puppeteer-extra will use puppeteer-core on Vercel
      launchOptions: {
        args: ChromiumClass.args,
        defaultViewport: ChromiumClass.defaultViewport,
        executablePath: executablePathValue,
        headless: 'new',
      }
    };
  } else {
    const puppeteerInstance = puppeteerExtra;
    return {
      puppeteer: puppeteerInstance,
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
  const url = 'https://www.gov.br/cvm/pt-br/search?origem=form&SearchableText=CBPS';

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

    const acceptButtonSelector = 'button.btn-accept';
    console.log(`Waiting for cookie consent button: ${acceptButtonSelector}...`);
    try {
      await page.waitForSelector(acceptButtonSelector, { timeout: 10000 });
      console.log('Cookie consent button found. Attempting to click...');
      await page.click(acceptButtonSelector);
      console.log('Cookie consent button clicked.');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (cookieError) {
      console.warn(`Warning: Cookie consent button not found or clickable within timeout. Proceeding without clicking. Details: ${cookieError.message}`);
    }

    const articleListContainerSelector = 'div.column.col-md-9 ul.searchResults.noticias';
    const articleItemSelector = `${articleListContainerSelector} li.item-collective.nitf.content`;
    console.log(`Waiting for individual article items to load: ${articleItemSelector}...`);

    try {
      await page.waitForSelector(articleItemSelector, { timeout: 15000 });
      console.log('Individual article items found. Starting scraping process.');
    } catch (error) {
      console.error('ERROR: No article items found within timeout:', error.message);
      return res.status(500).json({ success: false, error: 'Scraping failed: Article items not found.' });
    }

    const articles = await page.evaluate((listContainerSel) => {
      const items = Array.from(document.querySelectorAll(`${listContainerSel} li.item-collective.nitf.content`));
      const seenUrls = new Set();
      const results = [];

      items.forEach(item => {
        let title = null;
        let url = null;
        let date = 'N/A';

        const titleUrlEl = item.querySelector('span.titulo a');
        const dateEl = item.querySelector('span.descricao span.data');

        if (titleUrlEl) {
          title = titleUrlEl.textContent.trim();
          url = new URL(titleUrlEl.href, window.location.origin).href;
        }

        if (dateEl) {
          date = dateEl.textContent.trim();
        }

        if (title && url && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`[Browser Context] Found ${results.length} articles on listing page.`);
      return results;
    }, articleListContainerSelector);

    if (articles.length === 0) {
      console.warn('No articles found matching the specified criteria after scraping.');
      return res.status(200).json({ success: true, message: 'No articles found', data: [] });
    }

    console.log(`Successfully scraped ${articles.length} articles.`);
    return res.status(200).json({ success: true, data: articles });

  } catch (err) {
    console.error('An unhandled error occurred during the main scraping process:', err.message);
    console.error(err);
    return res.status(500).json({ success: false, error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}