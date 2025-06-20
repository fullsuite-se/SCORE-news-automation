const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

module.exports = async (req, res) => {
  try {
    const url = 'https://www.ascionline.in/complaint-outcomes/';
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    console.log('Navigating to ASCI Complaint Outcomes...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Close GDPR banner
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

    // Wait for filters
    try {
      await page.waitForSelector('div.sortOrderTopic input[type="checkbox"]', { timeout: 30000 });
    } catch (error) {
      console.error('Filters not found:', error);
      return res.status(500).json({ message: 'Filters not found' });
    }

    // Click specific filters
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

    // Click the Show More button once
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
      return items
        .map(item => {
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

          return { title, url, date };
        })
        .filter(article => article.title && article.url)
        .slice(0, 10);
    });

    console.log(`Found ${articles.length} articles.`);
    await browser.close();
    res.status(200).json(articles);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'Scraping failed' });
  }
};