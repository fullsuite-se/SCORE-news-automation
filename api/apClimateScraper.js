const isLambda = !!process.env.AWS_REGION;

async function getBrowserModules() {
  const puppeteer = isLambda 
    ? await import('puppeteer-core')
    : await import('puppeteer');
  
  const chromium = await import('@sparticuz/chromium-min');
  return { puppeteer, chromium };
}

module.exports = async (req, res) => {
  const { puppeteer, chromium } = await getBrowserModules();
  
  const browser = await puppeteer.launch({
      headless: true,
      slowMo: 50,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...(isLambda && {
        executablePath: await chromium.executablePath(),
        defaultViewport: chromium.defaultViewport,
      })
    });

  try {
    const page = await browser.newPage();
    const url = 'https://apnews.com/climate-and-environment';

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('div.PagePromo-content', { timeout: 15000 });

    // Extract up to 10 articles from the listing
    const articles = await page.evaluate(() => {
      const articleDivs = Array.from(document.querySelectorAll('div.PagePromo-content'));
      const raw = articleDivs.map(div => {
        const linkEl = div.querySelector('a.Link');
        const titleEl = div.querySelector('span.PagePromoContentIcons-text');

        const url = linkEl?.href || null;
        const title = titleEl?.textContent.trim() || null;

        return { title, url };
      }).filter(article => article.title && article.url);

      // Deduplicate by URL
      const seen = new Set();
      return raw.filter(article => {
        if (seen.has(article.url)) return false;
        seen.add(article.url);
        return true;
      });
    });

    if (articles.length === 0) {
      return res.status(200).json({ message: 'No articles found' });
    }

    const detailedArticles = [];

    for (let i = 0; i < Math.min(articles.length, 10); i++) {
      const { title, url } = articles[i];
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const date = await articlePage.evaluate(() => {
          const dateEl1 = document.querySelector('div.Page-dateModified');
          const dateEl2 = document.querySelector('[span-data-date]');
          return (dateEl1?.textContent || dateEl2?.textContent || '').trim();
        });

        detailedArticles.push({ title, url, date });
        await articlePage.close();
      } catch (err) {
        console.warn(`Failed to retrieve date for article ${i + 1}: ${err.message}`);
        detailedArticles.push({ title, url, date: '' });
      }
    }

    // Optional: deduplicate again by title (to be extra safe)
    const seenTitles = new Set();
    const deduplicated = detailedArticles.filter(article => {
      if (seenTitles.has(article.title)) return false;
      seenTitles.add(article.title);
      return true;
    });

    res.status(200).json(deduplicated);


  } catch (err) {
    console.error('Error scraping:', err);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    await browser.close();
  }
};