
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

export default async function handler(req, res) {
  let browser; 
  const mainUrl = 'https://www.al-monitor.com/contents/trending-topics/environment-and-nature';

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
    const mainPage = await browser.newPage(); 

    console.log('Navigating to Al-Monitor...');
    await mainPage.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }); 

    console.log('Waiting for article headings...');
    await mainPage.waitForSelector('div.card__heading', { timeout: 10000 });
    console.log('Article headings found.');

    console.log('Scraping initial article data (titles, URLs)...');
    const articlesWithoutDates = await mainPage.evaluate(() => {
      const seen = new Set();
      const articleNodes = document.querySelectorAll('div.card__heading');
      const results = [];

      Array.from(articleNodes).slice(0, 10).forEach(node => {
        const linkElem = node.querySelector('a.heading__link');
        const title = linkElem?.textContent?.trim() || null;
        let url = linkElem?.getAttribute('href') || null;

        if (url && !url.startsWith('http')) {
          url = 'https://www.al-monitor.com' + url; 
        }

        if (title && url && !seen.has(title)) { 
          seen.add(title);
          results.push({ title, url }); 
        }
      });
      console.log(`Found ${results.length} raw articles. Returning first 10.`);
      return results;
    });

    if (articlesWithoutDates.length === 0) {
      console.log('No articles found on the main page.');
      await mainPage.close(); 
      return res.status(200).json({ 
        success: true,
        message: 'No articles found with the specified selectors on the main page.', 
        data: [] 
      });
    }

    console.log(`Found ${articlesWithoutDates.length} articles. Now visiting each to scrape dates.`);

    const finalProcessedArticles = [];

    for (const article of articlesWithoutDates) {
      let articlePage; 
      try {
        articlePage = await browser.newPage();
        console.log(`- Navigating to article: ${article.url}`);
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        let date = null;
        try {
          await articlePage.waitForSelector('div.node__author_data div.node__dates', { timeout: 5000 }); 
          date = await articlePage.evaluate(() => {
            const dateElem = document.querySelector('div.node__author_data div.node__dates');
            return dateElem?.textContent?.trim() || null;
          });
          console.log(`  Scraped Date: ${date || 'N/A'}`);
        } catch (dateErr) {
          console.warn(`  Warning: Could not find date for "${article.title}" on its page: ${dateErr.message}`);
          date = null; 
        }

        if (date) { 
          finalProcessedArticles.push({ ...article, date });
        } else {
          console.log(` Skipping paywalled or undated article: ${article.url}`);
        }

      } catch (err) {
        console.warn(` Skipping article due to error or paywall: ${article.url} - ${err.message}`);
      } finally {
        if (articlePage) {
          await articlePage.close();
        }
      }
    }
    
    await mainPage.close(); 
    
    console.log(`Successfully scraped ${finalProcessedArticles.length} articles.`);
    return res.status(200).json({
      success: true,
      data: finalProcessedArticles 
    });

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