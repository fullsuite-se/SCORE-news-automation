
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
  const url = 'https://socpa.org.sa/Socpa/Media-Center/News.aspx';

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
    const page = await browser.newPage();
    const articles = [];
    const maxArticles = 10;

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    //**REPLACE STARTING HERE**

    const scrapedData = await page.evaluate((maxArticles) => {
        const results = [];
        // Find all elements that represent an article container.
        // <--- REPLACE THIS SELECTOR with the actual article container selector
        // const articleElements = document.querySelectorAll('ul > li');
        const articleElements = document.querySelectorAll('div.col-12 > div.news-box');
  
        if (articleElements.length === 0) {
            console.warn("No article container elements found with the provided selector. Please check your selector.");
            return [];
        }
  
        for (let i = 0; i < Math.min(articleElements.length, maxArticles); i++) {
            const articleElement = articleElements[i];
  
            // Extract Title
            // <--- REPLACE THIS SELECTOR
            const titleElement = articleElement.querySelector('h5 > a');
            const title = titleElement ? titleElement.innerText.trim() : 'N/A';
  
            // Extract Date
            // <--- REPLACE THIS SELECTOR
            const dateElement = articleElement.querySelector('p.news-date');
            const date = dateElement ? dateElement.innerText.trim() : 'N/A'
            // const date = dateElement ? dateElement.getAttribute('datetime') : 'N/A'
  
            // Extract Link
            // <--- REPLACE THIS SELECTOR
            const linkElement = articleElement.querySelector('h5 > a');
            // Use window.location.origin to ensure absolute URLs
            const link = linkElement ? new URL(linkElement.getAttribute('href'), window.location.origin).href : 'N/A';
  
            results.push({
                title: title,
                url: link,
                date: date,
            });
        }
        return results;
    }, maxArticles); // Pass maxArticles to the page.evaluate context
  
    articles.push(...scrapedData);

    //**UNTIL HERE**

    if (articles.length === 0) {
      console.log('No articles found.');
      return res.status(200).json({
        message: 'No articles found with the specified selectors.',
      });
    } else {
      console.log(`Successfully scraped ${articles.length} articles.`);
      return res.status(200).json(articles);
    }

  } catch (err) {
    console.error('Error during scraping:', err);
    return res.status(500).json({
      details: err.message || 'An unknown error occurred during scraping.'
    });
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
}