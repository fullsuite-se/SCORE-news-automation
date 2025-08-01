
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

    let executablePathValue = null;ß
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
  const url = 'https://www.bb.org.bd/en/index.php/mediaroom/circular';

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

    console.log("Navigating to BB Circulars page...");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    console.log("Selecting Sustainable Finance Department from dropdown...");
    await page.select("#cboDept", "61");

    console.log("Clicking Search button...");
    await page.click('input[name="search_circular"]');
    await new Promise(resolve => setTimeout(resolve, 5000)); 

    console.log("Scraping filtered results...");
    const articles = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("#sortableTable tbody tr"));
      const results = []; 

      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");

        const date = cells[0]?.textContent.trim() || null;
        const title = cells[1]?.textContent.trim() || null;

        let url = null;
        const indexToUse = cells[2]?.textContent.trim() === "Not Available" ? 3 : 2;

        if (cells[indexToUse]) {
          const linkEl = cells[indexToUse].querySelector("a.pdf-file");
          if (linkEl && linkEl.hasAttribute("pdf-link")) {
            url = linkEl.getAttribute("pdf-link");
          } else {
            url = cells[indexToUse].textContent.trim();
          }
        }

        if (date && title) {
            results.push({ date, title, url });
        }
      });
      console.log(`Found ${results.length} raw articles. Returning first 10.`);
      return results.slice(0, 10);
    });

    if (articles.length === 0) {
      console.log("No articles found.");
      return res.status(200).json({ 
        success: true,
        message: 'No articles found with the specified selectors after filtering.', 
        data: [] 
      });
    } else {
      console.log(`Successfully scraped ${articles.length} articles.`);
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