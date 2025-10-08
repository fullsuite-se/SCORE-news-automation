
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
  const url = 'https://www.ourchildrenstrust.org/press-releases';

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

    const acceptButtonSelector = 'a.sqs-popup-overlay-close'; // Example: A button with ID 'accept-cookies'
    const cookieBannerSelector = 'div.sqs-slide-layer-content'; // Example: The banner div itself

    console.log("DIAGNOSTIC (Outer): Checking for cookie consent banner...");
    try {
        await page.waitForSelector(acceptButtonSelector, { visible: true, timeout: 5000 });
        console.log("DIAGNOSTIC (Outer): Cookie accept button found. Attempting to click...");

        await page.evaluate((selector) => {
            const button = document.querySelector(selector);
            if (button) {
                button.click();
            } else {
                throw new Error(`Button with selector ${selector} not found in page.evaluate.`);
            }
        }, acceptButtonSelector);

        console.log("DIAGNOSTIC (Outer): Cookie accept button clicked (via evaluate).");

        await page.waitForSelector(cookieBannerSelector, { hidden: true, timeout: 5000 });
        console.log("DIAGNOSTIC (Outer): Cookie banner disappeared.");

        // Optional: Reload page after cookie acceptance for a clean state
        console.log("DIAGNOSTIC (Outer): Reloading page after cookie acceptance...");
        await page.reload({ waitUntil: 'networkidle0' });
        console.log("DIAGNOSTIC (Outer): Page reloaded.");


    } catch (cookieError) {
        console.warn(`DIAGNOSTIC (Outer): No cookie banner/accept button found or it timed out, or click failed. Proceeding without explicit cookie acceptance. Error: ${cookieError.message}`);
    }

    const scrapedData = await page.evaluate((maxArticles) => {
        const results = [];
        
        // Try multiple possible selectors
        let allParagraphs = document.querySelectorAll('div.sqs-html-content > p');
        
        // If no paragraphs found with that selector, try broader search
        if (allParagraphs.length === 0) {
            console.warn("DIAGNOSTIC (Inner): No paragraphs found with 'div.sqs-html-content > p', trying broader search...");
            allParagraphs = document.querySelectorAll('p');
            console.log(`DIAGNOSTIC (Inner): Found ${allParagraphs.length} total paragraphs on page.`);
        }
        
        if (allParagraphs.length === 0) {
            console.warn("DIAGNOSTIC (Inner): No paragraph elements found at all.");
            return [];
        }

        console.log(`DIAGNOSTIC (Inner): Processing ${allParagraphs.length} paragraph elements.`);

        // Process paragraphs to pair dates with articles
        let currentDate = 'N/A';
        
        for (let i = 0; i < allParagraphs.length && results.length < maxArticles; i++) {
            const paragraph = allParagraphs[i];
            const paragraphClass = paragraph.className;
            const paragraphText = paragraph.textContent.trim();
            
            console.log(`DIAGNOSTIC (Inner): Paragraph ${i}: class="${paragraphClass}", text="${paragraphText.substring(0, 100)}..."`);
            
            // Check if this paragraph contains a date (has class "sqsrte-large" and contains <strong>)
            const dateElement = paragraph.querySelector('strong');
            if (dateElement && paragraph.classList.contains('sqsrte-large')) {
                currentDate = dateElement.textContent.replace(/\s+/g, ' ').trim();
                console.log(`DIAGNOSTIC (Inner): Found date: ${currentDate}`);
                continue;
            }
            
            // Check if this paragraph contains an article link (contains <a> with text)
            const linkElement = paragraph.querySelector('a');
            if (linkElement && linkElement.textContent.trim()) {
                const title = linkElement.textContent.trim();
                const href = linkElement.getAttribute('href');
                
                console.log(`DIAGNOSTIC (Inner): Found link: title="${title.substring(0, 50)}...", href="${href}"`);
                
                // Skip empty links or links without titles
                if (!title || !href) {
                    console.log(`DIAGNOSTIC (Inner): Skipping empty link`);
                    continue;
                }
                
                // Use window.location.origin to ensure absolute URLs
                const link = new URL(href, window.location.origin).href;
                
                results.push({
                    title: title,
                    url: link,
                    date: currentDate,
                });
                
                console.log(`DIAGNOSTIC (Inner): Extracted article - Date: ${currentDate}, Title: ${title.substring(0, 50)}...`);
            }
        }
        
        console.log(`DIAGNOSTIC (Inner): Successfully extracted ${results.length} articles.`);
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