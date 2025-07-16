
const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  if (isVercelEnvironment) {
    const puppeteer = await import('puppeteer-core');
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
    const puppeteer = await import('puppeteer');
    return {
      puppeteer,
      chromiumArgs: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'], 
      chromiumDefaultViewport: null, 
      executablePath: undefined 
    };
  }
}

/**

 * @param {object} req 
 * @param {object} res 
 */
export default async function handler(req, res) {
  let browser; 
  const mainUrl = 'https://apnews.com/climate-and-environment';

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
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'], 
        };

    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));

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
      await mainPage.close(); 
      return res.status(200).json({ success: true, message: 'No articles found with the specified selectors.', data: [] });
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
    
    console.log(`Returning ${finalProcessedArticles.length} articles.`);
    return res.status(200).json({
      success: true,
      data: finalProcessedArticles
    });

  } catch (err) {
    console.error('An unhandled error occurred during the main scraping process:', err.message);
    // Send 500 status on unhandled errors
    return res.status(500).json({
      success: false,
      error: 'Scraping failed',
      details: err.message || 'An unknown error occurred during scraping.'
    });
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}