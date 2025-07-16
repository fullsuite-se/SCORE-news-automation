
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
  const mainUrl = 'https://climate.law.columbia.edu/node/1890';

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

    console.log('Navigating to Columbia Climate Law page...');
    await mainPage.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('Waiting for article links...');
    await mainPage.waitForSelector('h2.field-content a', { timeout: 15000 });
    console.log('Article links found.');

    console.log('Scraping initial article data (titles, URLs)...');
    const articlesWithoutDates = await mainPage.evaluate(() => {
      const articleLinks = document.querySelectorAll('h2.field-content a');
      const seen = new Set();
      const items = [];

      Array.from(articleLinks).forEach(link => {
        const url = link.href;
        const title = link.textContent.trim();

        if (url && title && !seen.has(url)) {
          seen.add(url);
          items.push({ title, url });
        }
      });
      return items.slice(0, 10);
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

    console.log(`Found ${articlesWithoutDates.length} articles. Now visiting each to extract publication dates.`);

    const finalProcessedArticles = [];

    for (const article of articlesWithoutDates) {
      let articlePage;
      try {
        articlePage = await browser.newPage();
        console.log(`- Navigating to article: ${article.url}`);
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        let date = 'Date not found';
        try {
          await articlePage.waitForSelector('div.views-field.views-field-field-cu-date time', { timeout: 5000 });
          date = await articlePage.evaluate(() => {
            const timeEl = document.querySelector('div.views-field.views-field-field-cu-date time');
            return timeEl ? timeEl.getAttribute('datetime') : 'Date not found';
          });
          console.log(`  Scraped Date: ${date}`);
        } catch (dateErr) {
          console.warn(`  Warning: Could not find date for "${article.title}" on its page: ${dateErr.message}`);
          date = 'Date not found';
        }

        finalProcessedArticles.push({ ...article, date });

      } catch (err) {
        console.error(`Error extracting date for ${article.url}: ${err.message}`);
        finalProcessedArticles.push({ ...article, date: 'Date not found', status: `Error visiting: ${err.message}` });
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
    console.error('Scraper failed:', err);
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