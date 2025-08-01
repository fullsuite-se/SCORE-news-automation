const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  const puppeteer = await import('puppeteer-core');
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
  } else {
    executablePathValue = ChromiumClass.executablePath;
  }

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
        headless: true,
      }
    : {
        headless: true,
        defaultViewport: null,
        slowMo: 50,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      };

  let browser;
  const baseUrl = 'https://www.xrb.govt.nz'; // Base URL for constructing absolute links
  const url = `${baseUrl}/standards/climate-related-disclosures/latest-updates/`;

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForSelector('div.block', { timeout: 60000 });

    const articles = await page.evaluate((baseUrl) => {
      const blocks = document.querySelectorAll('div.block');
      const seenUrls = new Set(); // To track seen URLs for deduplication
      const results = [];

      blocks.forEach(block => {
        let title = null;
        let url = null;
        let date = null;

        const textImageBlockTitleDiv = block.querySelector('.text-image-block__title');
        if (textImageBlockTitleDiv) {
          title = textImageBlockTitleDiv.querySelector('h2, h3')?.textContent.trim() || null;
          const textImageBody = block.querySelector('.text-image-block__body');
          if (textImageBody) {
            date = textImageBody.querySelector('p strong')?.textContent.trim() || null;
            const readMoreLink = textImageBody.querySelector('a');
            if (readMoreLink) {
              url = new URL(readMoreLink.getAttribute('href'), baseUrl).href; // Use baseUrl for absolute URL
            }
          }
        }

        // Alternative structure check if title is not found in the first type
        if (!title && block.classList.contains('content-block')) {
          const typographyDiv = block.querySelector('.typography');
          if (typographyDiv) {
            title = typographyDiv.querySelector('h2.h2')?.textContent.trim() || null;
            date = typographyDiv.querySelector('p:first-of-type')?.textContent.trim() || null;
            url = baseUrl; // For these blocks, the URL is likely the page itself or a generic one
          }
        }

        if (title && url && date && !seenUrls.has(url)) { // Deduplicate by URL
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`Found ${results.length} articles on listing page.`);
      return results.slice(0, 10); // Limit to 10 articles
    }, baseUrl); // Pass baseUrl to the evaluate function

    if (articles.length === 0) {
      console.warn('No articles found.');
      return res.status(200).json({ message: 'No articles found' });
    }

    console.log(`Returning ${articles.length} articles.`);
    res.status(200).json(articles);

  } catch (err) {
    console.error('Scraping failed:', err.message);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
