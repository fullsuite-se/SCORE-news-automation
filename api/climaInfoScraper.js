const isVercelEnvironment = !!process.env.AWS_REGION;
async function getBrowserModules() {
  await import('puppeteer-extra-plugin-stealth/evasions/chrome.app');
  await import('puppeteer-extra-plugin-stealth/evasions/chrome.csi');
  await import('puppeteer-extra-plugin-stealth/evasions/chrome.loadTimes');
  await import('puppeteer-extra-plugin-stealth/evasions/chrome.runtime');
  await import('puppeteer-extra-plugin-stealth/evasions/defaultArgs');
  await import('puppeteer-extra-plugin-stealth/evasions/iframe.contentWindow');
  await import('puppeteer-extra-plugin-stealth/evasions/media.codecs');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.hardwareConcurrency');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.languages');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.permissions');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.plugins');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.vendor');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.webdriver');
  await import('puppeteer-extra-plugin-stealth/evasions/sourceurl');
  await import('puppeteer-extra-plugin-stealth/evasions/user-agent-override');
  await import('puppeteer-extra-plugin-stealth/evasions/webgl.vendor');
  await import('puppeteer-extra-plugin-stealth/evasions/window.outerdimensions');

  
  const puppeteer = (await import('puppeteer-extra')).default;
  // stealth plugin to hide puppeteer
  const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
  puppeteer.use(StealthPlugin());
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
  const baseUrl = 'https://climainfo.org.br';
  const url = `${baseUrl}/noticias/`;
  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('h3.brxe-vzxxxz.brxe-heading.feed_post__title', { timeout: 10000 });
    const articles = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('h3.brxe-vzxxxz.brxe-heading.feed_post__title'));
      const seen = new Set();
      const results = [];
      allLinks.forEach(el => {
        const aTag = el.querySelector('a[href]');
        if (!aTag) return;
        const title = aTag.textContent.trim();
        const url = aTag.href;
        const date = 'Date not found'; // Date not present in original extraction, mark as such
        const uniqueKey = `${title}||${url}`;
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          results.push({ title, url, date });
        }
      });
      console.log(`Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
    });
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