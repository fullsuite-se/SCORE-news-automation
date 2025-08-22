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

export default async function handler(req, res) {
  let browser;
  const url = 'https://www.ascionline.in/complaint-outcomes/';

  try {
    const { puppeteer, chromiumArgs, chromiumDefaultViewport, executablePath } = await getBrowserModules();

    console.log('Attempting to launch Puppeteer browser...');
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
        
    console.log('--- Puppeteer Launch Information ---');
    console.log('Is Vercel Environment:', isVercelEnvironment);
    console.log('Launch Options:', JSON.stringify(launchOptions, null, 2));
    console.log('--- End Launch Info ---');
    
    console.log('Attempting to launch Puppeteer browser...');
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log('Navigating to ASCI Complaint Outcomes page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); 

    const closeBtnSelector = 'div.cmplz-close';
    try {
      await page.waitForSelector(closeBtnSelector, { timeout: 5000 });
      console.log('Closing cookie banner...');
      await page.click(closeBtnSelector);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.log('No cookie banner found or failed to close popup:', e.message);
    }

    const articleListContainerSelector = 'ul.searchBarCon_ul.searchBarCon_ul_comOutcome';
    console.log(`Waiting for article list container: ${articleListContainerSelector}...`);
    try {
      await page.waitForSelector(articleListContainerSelector, { timeout: 15000 });
      console.log('Article list container found.');
    } catch (error) {
      console.error('ERROR: Article list container not found within timeout:', error.message);
      return res.status(500).json({ success: false, error: 'Scraping failed: Article list container not found.' });
    }

    console.log('Waiting for filter checkboxes to be present...');
    try {
      await page.waitForSelector('div.sortOrderTopic input[type="checkbox"]', { timeout: 30000 });
      console.log('Filter checkboxes found.');
    } catch (error) {
      console.error('ERROR: Filters not found within timeout:', error.message);
      return res.status(500).json({ success: false, error: 'Scraping failed: Filters not found.' });
    }

    const filterValues = ['129', '130', '131', '132'];
    console.log(`Applying filters: ${filterValues.join(', ')}`);
    for (const value of filterValues) {
      try {
        const checkbox = await page.$(`div.sortOrderTopic input[type="checkbox"][value="${value}"]`);
        if (checkbox) {
          const isChecked = await (await checkbox.getProperty('checked')).jsonValue();
          if (!isChecked) {
            await checkbox.click();
            console.log(`- Clicked filter checkbox for value: ${value}`);
          } else {
            console.log(`- Filter checkbox for value: ${value} was already checked.`);
          }
        } else {
          console.warn(`- Warning: Checkbox with value="${value}" not found.`);
        }
      } catch (error) {
        console.error(`ERROR: Error clicking filter ${value}:`, error.message);
      }
    }

    console.log('Filters applied. Waiting for filtered results to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('Finished waiting for filters to load.');

    try {
      const showMoreButton = await page.$('button.showMoreCom');
      if (showMoreButton) {
        await showMoreButton.click();
        console.log('Clicked "Show More" button.');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.log('No "Show More" button found.');
      }
    } catch (error) {
      console.error('ERROR: Error interacting with "Show More" button:', error.message);
    }

    console.log('Starting scraping process within the article list container.');
    const articles = await page.evaluate((listContainerSel) => {
      const items = Array.from(document.querySelectorAll(`${listContainerSel} li`));
      const seen = new Set();
      const results = [];

      items.forEach(item => {
        const linkEl = item.querySelector('p.comOutcomeTitle a');
        const titleEl = item.querySelector('p.comOutcomeTitle');
        const spanlineP = item.querySelector('p.spanline');
        const spanlineSpans = spanlineP ? spanlineP.querySelectorAll('span') : [];

        const url = linkEl ? linkEl.href : null;
        const title = titleEl ? titleEl.textContent.trim() : null;

        let date = 'N/A';
        if (spanlineSpans.length >= 3) {
          date = spanlineSpans[2].textContent.trim();
        }

        if (title && url && !seen.has(url)) {
          seen.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
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