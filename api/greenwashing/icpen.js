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
        slowMo: 50,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      };

  let browser;
  const url = 'https://icpen.org/news';

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('div.teaser-icon, div.field.field--name-news-title.field--type-ds.field--label-hidden.field__item', { timeout: 15000 });

    const articles = await page.evaluate(() => {
      const allResults = [];
      const seen = new Set();

      function getDateText(element) {
        const parent = element.closest('.views-row');
        if (!parent) return null;

        const dateDiv =
          parent.querySelector('div.field--spaced.date-author.field.field--name-news-item-submitted-by.field--type-ds.field--label-hidden.field__item') ||
          parent.querySelector('div.date-author.field.field--name-news-item-submitted-by.field--type-ds.field--label-hidden.field__item');

        return dateDiv ? dateDiv.textContent.trim() : null;
      }

      const teaserDivs = Array.from(document.querySelectorAll('div.teaser-icon'));
      teaserDivs.forEach(teaser => {
        const titleDiv = teaser.querySelector('div.text--snug.field.field--name-news-title.field--type-ds.field--label-hidden.field__item');
        if (!titleDiv) return;

        const h2 = titleDiv.querySelector('h2');
        if (!h2) return;

        const link = h2.querySelector('a');
        if (!link) return;

        const title = link.textContent.trim();
        const url = link.href;
        const date = getDateText(teaser) || 'Date not found';

        if (title && url) {
          allResults.push({ title, url, date });
        }
      });

      const fieldDivs = Array.from(document.querySelectorAll('div.field.field--name-news-title.field--type-ds.field--label-hidden.field__item'));
      fieldDivs.forEach(div => {
        const h2 = div.querySelector('h2');
        if (!h2) return;
        const link = h2.querySelector('a');
        if (!link) return;

        const title = link.textContent.trim();
        const url = link.href;
        const date = getDateText(div) || 'Date not found';

        if (title && url) {
          allResults.push({ title, url, date });
        }
      });

      const uniqueArticles = allResults.filter(article => {
        if (seen.has(article.url)) return false;
        seen.add(article.url);
        return true;
      });
      console.log(`Found ${uniqueArticles.length} unique articles on listing page.`);
      return uniqueArticles;
    });

    if (articles.length === 0) {
      console.log('No articles found.');
      return res.status(200).json({ message: 'No articles found' });
    }

    const limitedArticles = articles.slice(0, 10);
    console.log(`Returning ${limitedArticles.length} articles.`);
    res.status(200).json(limitedArticles);

  } catch (err) {
    console.error('Error during scraping:', err.message);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}