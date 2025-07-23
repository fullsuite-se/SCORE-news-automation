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
        headless: true, // Must be true for serverless environments
      }
    : {
        headless: true, // Set to true for consistency, or false for local visual debugging
        defaultViewport: null,
        slowMo: 50,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      };

  let browser;
  const url = 'https://www.ascionline.in/complaint-outcomes/';

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log('Navigating to ASCI Complaint Outcomes...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    try {
      const closeBtn = await page.$('div.cmplz-close');
      if (closeBtn) {
        await closeBtn.click();
        console.log('Closed cookie banner.');
        await page.waitForTimeout(1000);
      }
    } catch (error) {
      console.log('No cookie banner found.');
    }

    try {
      await page.waitForSelector('div.sortOrderTopic input[type="checkbox"]', { timeout: 30000 });
    } catch (error) {
      console.error('Filters not found:', error);
      return res.status(500).json({ message: 'Filters not found' });
    }

    const filterValues = ['129', '130', '131', '132'];
    for (const value of filterValues) {
      try {
        const checkbox = await page.$(`div.sortOrderTopic input[type="checkbox"][value="${value}"]`);
        if (checkbox) {
          const isChecked = await (await checkbox.getProperty('checked')).jsonValue();
          if (!isChecked) await checkbox.click();
        }
      } catch (error) {
        console.error(`Error clicking filter ${value}:`, error);
      }
    }

    console.log('Filters applied. Waiting for filtered results...');
    await page.waitForTimeout(5000);

    try {
      const showMoreButton = await page.$('button.showMoreCom');
      if (showMoreButton) {
        await showMoreButton.click();
        console.log('Clicked Show More button.');
        await page.waitForTimeout(5000);
      }
    } catch (error) {
      console.log('No Show More button found.');
    }

    const articles = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('li'));
      const seenUrls = new Set(); // For deduplication
      const results = [];

      items.forEach(item => {
        const linkEl = item.querySelector('p.comOutcomeTitle a');
        const titleEl = item.querySelector('p.comOutcomeTitle');
        const spanlineP = item.querySelector('p.spanline');
        const spanlineSpans = spanlineP ? spanlineP.querySelectorAll('span') : [];

        const url = linkEl ? linkEl.href : null;
        const title = titleEl ? titleEl.textContent.trim() : null;

        let date = 'N/A';
        if (spanlineSpans.length >= 3) {
          const thirdSpan = spanlineSpans[2].textContent.trim();
          date = thirdSpan;
        }

        if (title && url && !seenUrls.has(url)) { // Deduplicate by URL
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
    });

    console.log(`Found ${articles.length} articles.`);
    res.status(200).json(articles);

  } catch (err) {
    console.error('Error during scraping:', err.message);
    res.status(500).json({ message: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}