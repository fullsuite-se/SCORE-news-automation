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

export default async function handler(req, res) {
    let browser;
    const url = 'https://www.telegraph.co.uk/climate-change/';

    const { puppeteer, chromiumArgs, chromiumDefaultViewport, executablePath } = await getBrowserModules();

    const launchOptions = isVercelEnvironment
        ? {
            args: chromiumArgs,
            defaultViewport: chromiumDefaultViewport,
            executablePath,
            headless: true,
        }
        : {
            headless: true,
            slowMo: 50,
            defaultViewport: null,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            executablePath,
        };

    try {
        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const articles = await page.evaluate(() => {
            const seen = new Set();
            return Array.from(document.querySelectorAll('div.card__content[data-test="article-comment-content"]'))
                .map(node => {
                    const linkTag = node.querySelector('a.list-headline__link');
                    const timeTag = node.querySelector('time.card__date');
                    if (!linkTag) return null;

                    const url = linkTag.href.trim();
                    const titleSpan = linkTag.querySelector('span[data-test="headline"] span');
                    const title = titleSpan?.textContent?.trim() || linkTag.textContent?.trim();
                    const date = timeTag?.textContent?.trim() || 'Date not found';

                    const key = `${title}||${url}`;
                    if (title && url && !seen.has(key)) {
                        seen.add(key);
                        return { title, url, date };
                    }

                    return null;
                })
                .filter(Boolean)
                .slice(0, 10);
        });

        if (!articles.length) {
            return res.status(200).json({ message: 'No articles found.' });
        }

        return res.status(200).json(articles);
    } catch (err) {
        console.error('Error scraping:', err);
        return res.status(500).json({ error: 'Scraping failed', details: err.message });
    } finally {
        if (browser) await browser.close();
    }
}