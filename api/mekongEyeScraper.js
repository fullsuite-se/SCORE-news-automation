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

export default async function(req, res) {
  let browser;
  const url = 'https://www.mekongeye.com/category/regions';

  try {
    StealthPlugin;
    puppeteer.use(StealthPlugin());

    const executablePathValue = typeof chromium.executablePath === 'function'
      ? await chromium.executablePath()
      : chromium.executablePath;

    const launchOptions = isVercelEnvironment
      ? {
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: executablePathValue,
        headless: true,
      }
      : {
        defaultViewport: null,
        slowMo: 50,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        executablePath: executablePathValue,
        headless: true,
      };
    
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('div.entry-container', { timeout: 30000 });

    const articles = await page.evaluate(() => {
      const nodes = document.querySelectorAll('div.entry-container');
      const map = new Map();

      nodes.forEach(article => {
        const header = article.querySelector('header.entry-header');
        const meta = article.querySelector('div.entry-meta time.entry-date.published');

        const anchor = header?.querySelector('a[rel="bookmark"]');
        const url = anchor?.getAttribute('href')?.trim();
        const title = anchor?.textContent?.trim();
        const date = meta?.getAttribute('datetime') || meta?.textContent?.trim() || null;

        const key = `${title}||${url}`;
        if (title && url && date && !map.has(key)) {
          map.set(key, { title, url, date });
        }
      });

      console.log(`Found ${map.size} articles before slicing`);
      return Array.from(map.values()).slice(0, 10);
    });

    if (articles.length === 0) {
      console.log('No articles found!')
      res.status(200).json({ message: 'No articles found' });
      return;
    }

    res.status(200).json(articles);
  } catch(e) {
    console.error('Scraping failed:', e.message);
    res.status(500).json({ error: 'Scraping failed', details: e.message })
  } finally {
    if (browser) await browser.close();
  }
}