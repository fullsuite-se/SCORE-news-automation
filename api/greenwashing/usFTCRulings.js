import puppeteerExtra from 'puppeteer-extra';

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

export default async function handler(req, res) {
  let browser;
  const url = 'https://www.ftc.gov/legal-library/browse/cases-proceedings?sort_by=field_date&items_per_page=20&field_mission%5B29%5D=29&search=&field_competition_topics=All&field_consumer_protection_topics=1408&field_federal_court=All&field_industry=All&field_case_status=All&field_enforcement_type=All&search_matter_number=&search_civil_action_number=&start_date=&end_date=';

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

    const mainContainerSelector = 'div.view-content';
    console.log(`Waiting for main articles container: ${mainContainerSelector}...`);
    await page.waitForSelector(mainContainerSelector, { timeout: 15000 });
    console.log('Main articles container found. Proceeding to scrape individual articles.');

    const articles = await page.evaluate((baseUrl) => {
      const results = [];
      const seenUrls = new Set();
      const articleContainers = document.querySelectorAll('div.view-content div.views-row');

      articleContainers.forEach(container => {
        let title = null;
        let url = null;
        let date = 'N/A';

        const titleEl = container.querySelector('article .node__content .group h3.node-title');
        const linkEl = container.querySelector('article .node__content .group h3 a');
        const dateEl = container.querySelector('article .node__content .group .field--name-field-date time');

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