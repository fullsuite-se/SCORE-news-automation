
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
  const url = "https://www.secp.gov.pk/media-center/press-releases/";

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
    const page = await browser.newPage();

    console.log("Navigating to SECP press releases page...");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    const closePopupSelector = "#sgpb-close-button";
    // Check if popup exists and close it
    try {
        await page.waitForSelector(closePopupSelector, { timeout: 5000 });
        console.log("Closing popup...");
        await page.click(closePopupSelector);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Short delay after clicking popup
    } catch (e) {
        console.log("No popup found or failed to close popup:", e.message);
    }

    const searchSelector = 'div#DataTables_Table_0_filter input[type="search"]';
    await page.waitForSelector(searchSelector, { timeout: 15000 });
    console.log('Typing "Sustainability" into search bar...');
    await page.type(searchSelector, "Sustainability");

    console.log("Waiting 5 seconds after search for filter to apply...");
    await new Promise(resolve => setTimeout(resolve, 5000)); // Standard delay

    console.log("Scraping filtered articles...");
    const articles = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll("tbody tr.download-row-table")
      ).filter((row) => row.offsetParent !== null); // Filter for visible rows
      
      return rows
        .slice(0, 10) // Limit to 10 results
        .map((row) => {
          const titleEl = row.querySelector("td.download-title");
          const linkEl = row.querySelector("td.download-link a");
          const dateEl = row.querySelector("td.download-date");

          const title = titleEl ? titleEl.textContent.trim() : null;
          const url = linkEl ? linkEl.href : null;
          const date = dateEl ? dateEl.textContent.trim() : null;

          return { title, url, date };
        })
        .filter((article) => article.title && article.url && article.date);
    });

    if (articles.length === 0) {
      console.log("No articles found.");
      return res.status(200).json({ 
        success: true,
        message: 'No articles found with the specified criteria after filtering.', 
        data: [] 
      });
    } else {
      console.log(`Found ${articles.length} articles.`);
      return res.status(200).json({
        success: true,
        data: articles
      });
    }
  } catch (err) {
    console.error("Error during scraping:", err);
    return res.status(500).json({ 
      success: false,
      error: 'Scraping failed', 
      details: err.message || 'An unknown error occurred during scraping.' 
    });
  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
    }
  }
}