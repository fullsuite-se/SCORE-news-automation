
const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  const puppeteer = (await import('puppeteer-extra')).default;
  const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
  puppeteer.use(StealthPlugin());

  if (!isVercelEnvironment) {
    return {
      puppeteer,
      launchOptions: {
        headless: "new",
        slowMo: 50,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      }
    };
  }

  const { default: chromium } = await import('@sparticuz/chromium');
  const executablePath = await chromium.executablePath();

  return {
    puppeteer,
    launchOptions: {
      args: chromium.args,
      executablePath: executablePath,
      headless: 'new',
    }
  };
}

/**
 * @param {object} req - The Vercel request object.
 * @param {object} res - The Vercel response object.
 */
export default async function (req, res) {
  const { puppeteer, launchOptions } = await getBrowserModules();

  console.log('--- Puppeteer Launch Debug Info ---');
  console.log('isVercelEnvironment:', isVercelEnvironment);
  console.log('Launch Options:', JSON.stringify(launchOptions, null, 2));
  console.log('--- End Debug Info ---');
  
  let browser;
  const baseUrl = 'https://enb.iisd.org';
  const url = `${baseUrl}/archives`;

  try {
    console.log('Attempting to launch Puppeteer...');
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    console.log(`Navigating to initial URL: ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('Waiting for initial articles selector (div.views-row)...');
    try {
      await page.waitForSelector('div.views-row', { timeout: 15000 });
      console.log('Initial articles selector found.');
    } catch (selectorError) {
      console.error(`ERROR: Initial selector not found or timed out: ${selectorError.message}`);
      // Taking a screenshot is not possible in Vercel functions, but helpful for local debugging.
      if (!isVercelEnvironment) {
        await page.screenshot({ path: 'screenshot_initial_selector_timeout.png' });
        console.log('Screenshot saved to screenshot_initial_selector_timeout.png');
      }
      res.status(500).json({ error: 'Scraping failed: Initial selector not found' });
      return; 
    }

    console.log('Scraping articles...');
    const articles = await page.evaluate(() => {
      const allArticleContainers = Array.from(document.querySelectorAll('div.views-row'));
      const seenUrls = new Set();
      const results = [];

      allArticleContainers.slice(0, 10).forEach(container => {
        const linkEl = container.querySelector('article h3 a');
        const dateEl = container.querySelector('article small.c-list-item__meta span.c-list-item__meta-date');
        
        const title = linkEl ? linkEl.textContent.trim() : null;
        const url = linkEl ? linkEl.href : null;
        const date = dateEl ? dateEl.textContent.trim() : null;

        if (title && url && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });
      return results;
    });

    if (articles.length === 0) {
      console.warn('No articles found after evaluation.');
      res.status(200).json({ message: 'No articles found' });
    } else {
      console.log(`Collected ${articles.length} articles.`);
      
      if (!isVercelEnvironment) {
          const filename = 'iisdEnbArchives.json';
          const fullPath = path.join(process.cwd(), filename);
          fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
          console.log(`JSON file saved as ${filename} at: ${fullPath}`);
      }

      res.status(200).json(articles);
    }
  } catch (err) {
    console.error('Error during scraping (main catch block):', err);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
}