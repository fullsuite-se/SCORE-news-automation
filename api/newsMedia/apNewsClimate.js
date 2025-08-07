const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  let puppeteerInstance;
  let launchOptions;

  const stealthPluginModule = await import('puppeteer-extra-plugin-stealth');
  const stealthPlugin = stealthPluginModule.default;

  if (isVercelEnvironment) {
    const puppeteerCoreModule = await import('puppeteer-core');
    const { default: Chromium } = await import('@sparticuz/chromium');

    puppeteerInstance = puppeteerCoreModule;
    puppeteerInstance.use(stealthPlugin());

    const executablePath = await Chromium.executablePath();
    if (!executablePath) {
      throw new Error('Chromium executable path not found on Vercel.');
    }

    launchOptions = {
      args: Chromium.args,
      defaultViewport: Chromium.defaultViewport,
      executablePath: executablePath,
      headless: true,
    };

    console.log('--- Vercel Environment Setup ---');
    console.log('Using puppeteer-core and @sparticuz/chromium.');
    console.log('Executable Path:', executablePath);
    console.log('------------------------------');

  } else {
    const puppeteerExtraModule = await import('puppeteer-extra');
    puppeteerInstance = puppeteerExtraModule.default;
    puppeteerInstance.use(stealthPlugin());

    launchOptions = {
      headless: 'new',
      slowMo: 50,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
    };

    console.log('--- Local Environment Setup ---');
    console.log('Using puppeteer-extra.');
    console.log('---------------------------');
  }

  return { puppeteer: puppeteerInstance, launchOptions };
}

export default async function (req, res) {
  let browser;
  const mainUrl = 'https://apnews.com/climate-and-environment';

  try {
    const { puppeteer, launchOptions } = await getBrowserModules();

    console.log('--- Puppeteer Launch Info ---');
    console.log('Launch Options:', JSON.stringify(launchOptions, null, 2));
    console.log('--- End Launch Info ---');

    console.log('Attempting to launch browser...');
    browser = await puppeteer.launch(launchOptions);
    const mainPage = await browser.newPage();

    console.log(`Navigating to main page: ${mainUrl}...`);
    await mainPage.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

    const mainContainerSelector = 'div.PageListStandardH';
    const articlePromoSelector = `${mainContainerSelector} div.PagePromo`;
    const titleLinkSelector = 'div.PagePromo-content h3.PagePromo-title a.Link';
    const titleTextSpanSelector = 'span.PagePromoContentIcons-text';
    const articlePageDateSelector = 'div.StoryPage-actions-wrapper .Page-dateModified bsp-timestamp span[data-date]';

    console.log('Waiting for articles container on main page...');
    await mainPage.waitForSelector(articlePromoSelector, { timeout: 60000 });
    console.log('Article containers found. Extracting initial details...');

    const articlesToVisit = await mainPage.evaluate((promoSel, titleLinkSel, titleTextSpanSelectorArgument) => {
      const tempArticles = [];
      const articlePromos = document.querySelectorAll(promoSel);
      const limit = 5;

      Array.from(articlePromos).slice(0, limit).forEach(promo => {
        const linkEl = promo.querySelector(titleLinkSel);
        const titleSpanEl = linkEl?.querySelector(titleTextSpanSelectorArgument);

        const title = titleSpanEl ? titleSpanEl.textContent.trim() : null;
        const url = linkEl ? linkEl.href : null;

        if (title && url) {
          tempArticles.push({ title, url });
        }
      });
      return tempArticles;
    }, articlePromoSelector, titleLinkSelector, titleTextSpanSelector);

    if (articlesToVisit.length === 0) {
      console.log('No articles found on the main page.');
      await mainPage.close();
      return res.status(200).json({ message: 'No articles found' });
    }

    console.log(`Found ${articlesToVisit.length} articles. Now scraping dates.`);

    const finalProcessedArticles = [];

    for (let i = 0; i < articlesToVisit.length; i++) {
      const article = articlesToVisit[i];
      let newTab;

      try {
        newTab = await browser.newPage();
        console.log(`- Opening tab for article ${i + 1}/${articlesToVisit.length}: ${article.url}`);
        await newTab.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        let date = null;
        try {
          await newTab.waitForSelector(articlePageDateSelector, { timeout: 15000 });
          date = await newTab.evaluate((dateSel) => {
            const dateEl = document.querySelector(dateSel);
            return dateEl ? dateEl.textContent.trim() : null;
          }, articlePageDateSelector);
          console.log(`  Scraped Date: ${date || 'N/A'}`);
        } catch (dateErr) {
          console.warn(`  Warning: Could not find date for "${article.title}": ${dateErr.message}`);
          date = null;
        }
        
        const articleWithDate = { ...article, date };
        console.log(`- Closing tab for: "${article.title}"`);
        await newTab.close();
        
        finalProcessedArticles.push(articleWithDate);
      } catch (err) {
        console.error(`Error processing article "${article.title}" (${article.url}): ${err.message}`);
        finalProcessedArticles.push({ ...article, date: null, status: `Error: ${err.message}` });
        if (newTab) {
          await newTab.close().catch(e => console.error(`Error closing errored tab: ${e.message}`));
        }
      }
    }

    await mainPage.close();
    
    console.log(`\n-----------------------------------`);
    console.log(`Final Scraped Data:`);
    console.log(JSON.stringify(finalProcessedArticles, null, 2));
    console.log(`-----------------------------------`);
    
    res.status(200).json(finalProcessedArticles);

  } catch (err) {
    console.error('An unhandled error occurred during scraping:', err.message);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}
