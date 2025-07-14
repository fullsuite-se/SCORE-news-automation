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
        headless: "new", 
      }
    : {
        headless: "new", 
        defaultViewport: null,
        slowMo: 50,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        executablePath: executablePath,
      };

  let browser;
  const baseUrl = 'https://competition-bureau.canada.ca';
  const listUrl = `${baseUrl}/en/deceptive-marketing-practices/cases-and-outcomes`;

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log(`Navigating to list page: ${listUrl}`);
    await page.goto(listUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('Waiting for article list rows...');
    await page.waitForSelector('tr[role="row"]', { timeout: 30000 });
    console.log('Article list rows found.');

    const articleLinks = await page.evaluate((origin) => {
      const rows = document.querySelectorAll('tr[role="row"]');
      const urls = [];
      const seenUrls = new Set();

      rows.forEach(row => {
        const linkEl = row.querySelectorAll('td')[2]?.querySelector('a');

        if (linkEl && linkEl.href) {
          const absoluteUrl = new URL(linkEl.href, origin).href;
          if (!seenUrls.has(absoluteUrl)) {
            urls.push(absoluteUrl);
            seenUrls.add(absoluteUrl);
          }
        }
      });
      console.log(`Found ${urls.length} article links on listing page.`);
      return urls.slice(0, 10);
    }, baseUrl);

    const results = [];
    let articlesScrapedCount = 0;

    for (const articleUrl of articleLinks) {
      if (articlesScrapedCount >= 10) {
          break;
      }

      const articlePage = await browser.newPage();
      try {
        console.log(`Navigating to article page: ${articleUrl}`);
        await articlePage.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log(`Waiting for title on article page: ${articleUrl}`);
        await articlePage.waitForSelector('h1#wb-cont', { timeout: 10000 });
        console.log('Title found on article page.');

        const data = await articlePage.evaluate(() => {
          const titleEl = document.querySelector('h1#wb-cont');
          const dateSourceEl = document.querySelector('p.gc-byline');

          const title = titleEl ? titleEl.textContent.trim() : null;
          let date = 'N/A';

          if (dateSourceEl) {
            const dateText = dateSourceEl.textContent.trim();
            const match = dateText.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/);
            if (match && match[0]) {
              date = match[0];
            } else {
              date = dateText;
            }
          }

          return { title, date };
        });

        if (data.title) {
          results.push({ title: data.title, url: articleUrl, date: data.date });
          articlesScrapedCount++;
        }
      } catch (err) {
        console.error(`Skipping article due to error: ${articleUrl} - ${err.message}`);
      } finally {
        await articlePage.close();
      }
    }

    if (results.length === 0) {
      console.log('No articles found or scraped successfully!');
      return res.status(200).json({ message: 'No articles found or scraped successfully' });
    }

    console.log(`Scraped ${results.length} articles (limited to 10).`);
    res.status(200).json(results);

  } catch (err) {
    console.error('Scraping failed:', err.message);
    console.error(err);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      console.log('Closing browser.');
      await browser.close();
    }
  }
}
