const fs = require('fs');
const path = require('path');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let puppeteer, chromium;
const isServerless = !!process.env.AWS_REGION;

if (isServerless) {
  puppeteer = require('puppeteer-core');
  chromium = require('@sparticuz/chromium');
} else {
  puppeteer = require('puppeteer');
}

module.exports = async (req, res) => {
  const url = 'https://www.ascionline.in/complaint-outcomes/';
  let browser;

  try {
    console.log('Launching Puppeteer...');
    const launchOptions = isServerless
      ? {
          headless: chromium.headless,
          args: chromium.args,
          executablePath: await chromium.executablePath(),
        }
      : {
          headless: false,
          slowMo: 50,
        };

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log('Navigating to ASCI Complaint Outcomes...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Close GDPR banner
    const closeBtn = await page.$('div.cmplz-close');
    if (closeBtn) {
      await closeBtn.click();
      console.log('Closed cookie banner.');
      await delay(1000);
    }

    // Wait for filters
    await page.waitForSelector('div.sortOrderTopic input[type="checkbox"]', { timeout: 30000 });

    // Click specific filters
    const filterValues = ['129', '130', '131', '132'];
    for (const value of filterValues) {
      const checkbox = await page.$(`div.sortOrderTopic input[type="checkbox"][value="${value}"]`);
      if (checkbox) {
        const isChecked = await (await checkbox.getProperty('checked')).jsonValue();
        if (!isChecked) await checkbox.click();
      }
    }

    console.log('Filters applied. Waiting for filtered results...');
    await delay(5000);

    // Click the Show More button once
    const showMoreButton = await page.$('button.showMoreCom');
    if (showMoreButton) {
      await showMoreButton.click();
      console.log('Clicked Show More button.');
      await delay(5000);
    }

    const articles = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('li'));
      return items
        .map(item => {
          const linkEl = item.querySelector('p.comOutcomeTitle a');
          const titleEl = item.querySelector('p.comOutcomeTitle');
          const spanlineSpans = item.querySelectorAll('p.spanline span');

          const url = linkEl ? linkEl.href : null;
          const title = titleEl ? titleEl.textContent.trim() : null;

          let date = 'N/A';
          if (spanlineSpans.length >= 3) {
            const thirdSpan = spanlineSpans[2].textContent.trim();
            const dateMatch = thirdSpan.match(/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/);
            if (dateMatch) date = dateMatch[0];
          }

          return { title, url, date };
        })
        .filter(article => article.title && article.url)
        .slice(0, 10);
    });

    console.log(`✅ Found ${articles.length} articles.`);
    res.status(200).json(articles);
  } catch (err) {
    console.error('❌ Scraping failed:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
};
