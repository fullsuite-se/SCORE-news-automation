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
  const mainUrl = 'https://apnews.com/climate-and-environment'; // This URL seems to be the one from the previous context

  try {
    const { puppeteer, launchOptions } = await getBrowserModules();

    console.log('--- Puppeteer Launch Information ---');
    console.log('Is Vercel Environment:', isVercelEnvironment);
    console.log('Launch Options:', JSON.stringify(launchOptions, null, 2));
    console.log('--- End Launch Info ---');
    
    console.log('Attempting to launch Puppeteer browser...');
    browser = await puppeteer.launch(launchOptions);
    const mainPage = await browser.newPage();

    console.log(`Navigating to main page: ${mainUrl}...`);
    await mainPage.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

    // --- Cookie/Consent Button Handling (if applicable for APNews) ---
    // Note: The previous APNews script didn't explicitly have cookie handling,
    // but if it ever appeared, this pattern would be useful.
    // For the original APNews context, this block might not be strictly necessary
    // unless a new banner appeared.
    try {
        const closeBtn = await mainPage.$('div.cmplz-close'); // Selector from a previous context, might not apply to APNews
        if (closeBtn) {
            await closeBtn.click();
            console.log('Closed cookie banner.');
            await new Promise(resolve => setTimeout(resolve, 1000)); // Replaced page.waitForTimeout
        }
    } catch (error) {
        console.log('No specific cookie banner with selector "div.cmplz-close" found or an error occurred during interaction.');
    }
    // --- End Cookie/Consent Button Handling ---


    const mainContainerSelector = 'div.PageListStandardH';
    const articlePromoSelector = `${mainContainerSelector} div.PagePromo`;
    const titleLinkSelector = 'div.PagePromo-content h3.PagePromo-title a.Link';
    const titleTextSpanSelector = 'span.PagePromoContentIcons-text';
    const articlePageDateSelector = 'div.StoryPage-actions-wrapper .Page-dateModified bsp-timestamp span[data-date]';

    console.log('Waiting for articles container on main page...');
    await mainPage.waitForSelector(articlePromoSelector, { timeout: 60000 });
    console.log(`Article containers found on main page. Extracting initial details (title, URL).`);

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
      console.log('No articles found on the main page matching the specified criteria.');
      return res.status(200).json([]);
    }

    console.log(`Found ${articlesToVisit.length} articles. Now processing each in a new tab to scrape dates.`);

    const finalProcessedArticles = [];

    for (let i = 0; i < articlesToVisit.length; i++) {
      const article = articlesToVisit[i];
      let newTab;

      try {
        newTab = await browser.newPage();
        console.log(`- Opening new tab for article ${i + 1}/${articlesToVisit.length}: ${article.url}`);
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
          console.warn(`  Warning: Could not find date for "${article.title}" on its page: ${dateErr.message}`);
          date = null;
        }
        
        const articleWithDate = { ...article, date };
        console.log(`- Closing tab for: "${article.title}"`);
        await newTab.close();
        
        finalProcessedArticles.push(articleWithDate);
      } catch (err) {
        console.error(`Error processing tab for article "${article.title}" (${article.url}): ${err.message}`);
        finalProcessedArticles.push({ ...article, date: null, status: `Error visiting/processing: ${err.message}` });
        if (newTab) {
          await newTab.close().catch(e => console.error(`Error closing errored tab: ${e.message}`));
        }
      }
    }

    await mainPage.close();
    
    console.log(`Successfully scraped and processed ${finalProcessedArticles.length} articles.`);
    return res.status(200).json(finalProcessedArticles);

  } catch (err) {
    console.error('An unhandled error occurred during the main scraping process:', err.message);
    return res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}