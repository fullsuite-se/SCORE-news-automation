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
export default async function (req, res) {
  const { puppeteer, chromiumArgs, chromiumDefaultViewport, executablePath } = await getBrowserModules();
  console.log('--- Puppeteer Launch Debug Info (Vercel) ---');
  console.log('isVercelEnvironment:', isVercelEnvironment);
  console.log('chromiumArgs (from @sparticuz/chromium):', chromiumArgs);
  console.log('chromiumDefaultViewport (from @sparticuz/chromium):', chromiumDefaultViewport);
  console.log('Executable Path (from @sparticuz/chromium):', executablePath);
  console.log('--- End Debug Info (Vercel) ---');
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
        headless: "new", // Must be true for serverless environments
      }
    : {
        headless: "new", // Set to true for consistency, or false for local visual debugging
        defaultViewport: null,
        slowMo: 50,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        executablePath: executablePath,
      };
  let browser;

  const url = `https://www.congress.gov/search?q=%7B%22source%22%3A%22legislation%22%2C%22congress%22%3A%22all%22%2C%22bill-status%22%3A%22law%22%2C%22subject%22%3A%22Health%22%7D`
  const articles = [];
  const maxArticles = Infinity;
  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
   
    //**REPLACE STARTING HERE**
    
   let currentPageNum = 1;
        const nextPageSelector = 'a.next'; // <--- IMPORTANT: REPLACE WITH ACTUAL NEXT PAGE BUTTON/LINK SELECTOR
         const firstArticleLinkOnPageSelector = 'ol.basic-search-results-lists.expanded-view > li.compact > span.result-heading > a';

        while (true) {
            const scrapedData = await page.evaluate((maxArticles) => {
            var results = [];
            // Find all elements that represent an article container.
            // <--- REPLACE THIS SELECTOR with the actual article container selector
            const items = Array.from(
                document.querySelectorAll(
                    "ol.basic-search-results-lists.expanded-view > li.compact, ol.basic-search-results-lists > li.compact"
                )
            );

            const length = items.length;

            results = items.map((item) => {
                const legislationName =
                    `${item.querySelector(".result-heading a")?.innerText.trim()} - ${item
                      .querySelector(".result-title")
                      ?.innerText.trim()}` || "";
                
              let displayTitle = "";
                const latestActionSpan = Array.from(
                item.querySelectorAll("span.result-item")
                ).find((span) => span.textContent.includes("Latest Action"));
                if (latestActionSpan) {
                const linkTitle = Array.from(latestActionSpan.querySelectorAll("a"))
                    .map((a) => a.innerText.trim())
                    .find((t) => !/PDF|All Actions/i.test(t));
                if (linkTitle) {
                    displayTitle = linkTitle;
                } else {
                    const text = latestActionSpan.textContent || "";
                    const match = text.match(
                    /\b(Public|Private)\s+Law(?:\s+No\.?\s*|\s+)?[\w\-]+/i
                    );
                    if (match) {
                    let raw = match[0].trim();
                    raw = raw.replace(/\s+law/i, " Law");
                    if (!/No/i.test(raw)) {
                        raw = raw.replace(/Law\s+(\d)/i, "Law No. $1");
                    }
                    displayTitle = raw;
                    }
                }
                }
            

                const sourceRel =
                    item.querySelector(".result-heading a")?.getAttribute("href") || "";
                 const sourcelink = sourceRel.startsWith("http")
                    ? sourceRel
                    : "https://congress.gov" + sourceRel;

                let pdflink = null;
                    if (latestActionSpan) {
                    const pdfAnchor = latestActionSpan.querySelector('a[href$=".pdf"]');
                    if (pdfAnchor) {
                        const href = pdfAnchor.getAttribute("href");
                        pdflink = href.startsWith("http")
                        ? href
                        : "https://congress.gov" + href;
                    }
                }
                    return {length, legislationName, displayTitle, sourcelink, pdflink};
                })
                return results;
            }, maxArticles); // Pass maxArticles to the page.evaluate context

            articles.push(...scrapedData);
            
             const firstArticleTextOnCurrentPage = await page.evaluate(() => {
                // Hardcode the selector directly here
                const firstArticle = document.querySelector('ol.basic-search-results-lists.expanded-view > li.compact, ol.basic-search-results-lists > li.expanded');
                return firstArticle ? firstArticle.innerText : '';
            }); 

             const currentFirstArticleLink = await page.evaluate(selector => {
                const firstArticleElement = document.querySelector(selector);
                return firstArticleElement ? firstArticleElement.href : '';
            }, firstArticleLinkOnPageSelector);

             const nextButton = await page.$(nextPageSelector);
            
            if (nextButton) {
                // Check if the next button is disabled or has an attribute indicating it's the last page
                const isDisabled = await nextButton.evaluate(el => el.disabled || el.classList.contains('desativada') || el.getAttribute('aria-disabled') === 'true');
                const nextButtonHref = await nextButton.evaluate(el => el.href);

                console.log(`DIAGNOSTIC (Outer): Next button found. Is disabled: ${isDisabled}. Href: ${nextButtonHref}`);

                if (isDisabled || !nextButtonHref) { // If disabled or no valid href, assume no more pages
                    console.log("DIAGNOSTIC (Outer): Next button is disabled or has no valid href. Exiting pagination loop.");
                    break;
                }

                console.log(`Navigating to next page (${currentPageNum + 1})...`);
                await Promise.all([
                    nextButton.click(),
                    // Wait for the URL of the page to change AND the first article's link to be different
                    page.waitForFunction(
                        (oldFirstArticleLink, selector) => {
                            const newFirstArticleElement = document.querySelector(selector);
                            const newFirstArticleLink = newFirstArticleElement ? newFirstArticleElement.href : null;
                            // Log inside the browser context to see what it's evaluating
                            console.log(`waitForFunction (Content Change): Old Link: ${oldFirstArticleLink}, New Link: ${newFirstArticleLink}`);
                            return newFirstArticleElement && newFirstArticleLink !== oldFirstArticleLink;
                        },
                        { timeout: 120000 }, // Increased timeout for this critical wait to 60 seconds
                        currentFirstArticleLink, // Current first article link
                        firstArticleLinkOnPageSelector // Selector for the first article link
                    )
                ]);
                currentPageNum++;
            } else {
                console.log("No more pages found. Exiting pagination loop (Next button not found).");
                break;
            }
        }

    //**UNTIL HERE**
        
    if (articles.length === 0) {
      console.log('No articles found!');
      return res.status(200).json({ message: 'No articles found' });
    }
    console.log(`Returning ${articles.length} articles.`);
    res.status(200).json(articles);
  } catch (err) {
    console.error('Error during scraping:', err.message);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}