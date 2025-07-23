
import fs from 'fs';
import path from 'path';
import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(stealthPlugin());

async function getBrowserModules() {
  const puppeteer = puppeteerExtra;
  return {
    puppeteer,
    launchOptions: {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    }
  };
}

async function main() {
  let browser;
  const mainUrl = 'https://apnews.com/climate-and-environment';

  try {
    const { puppeteer, launchOptions } = await getBrowserModules();

    console.log('--- Puppeteer Launch Info ---');
    console.log('Launch Options:', JSON.stringify(launchOptions, null, 2));
    console.log('--- End Info ---');
    
    console.log('Attempting to launch Puppeteer...');
    browser = await puppeteer.launch(launchOptions);
    const mainPage = await browser.newPage();

    console.log(`Navigating to main page: ${mainUrl}...`);
    await mainPage.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

    const mainContainerSelector = 'div.PageListStandardH';
    const articlePromoSelector = `${mainContainerSelector} div.PagePromo`;
    const titleLinkSelector = 'div.PagePromo-content h3.PagePromo-title a.Link';
    const titleTextSpanSelector = 'span.PagePromoContentIcons-text';
    const articlePageDateSelector = 'div.StoryPage-actions-wrapper .Page-dateModified bsp-timestamp span[data-date]';

    console.log('Waiting for articles container on main page...');
    await mainPage.waitForSelector(articlePromoSelector, { timeout: 60000 });
    console.log(`Article containers found on main page. Extrssacting initial details (title, URL).`);

    const articlesToVisit = await mainPage.evaluate((promoSel, titleLinkSel, titleTextSpanSelectorArgument) => {
      const tempArticles = [];
      const articlePromos = document.querySelectorAll(promoSel);
      const limit = 5;

      Array.from(articlePromos).slice(0, limit).forEach(promo => {
        const linkEl = promo.querySelector(titleLinkSel);
        const titleSpanEl = linkEl?.querySelector(titleTextSpanSelectorArgument);

        const title = titleSpanEl ? titleSpanEl.textContent.trim() : null;
        const url = linkEl ? linkEl.href : null;

        if (title && url) {
          tempArticles.push({ title, url });
        }
      });
      return tempArticles;
    }, articlePromoSelector, titleLinkSelector, titleTextSpanSelector);

    if (articlesToVisit.length === 0) {
      console.log('No articles found on the main page matching the specified criteria.');
      return;
    }

    console.log(`Found ${articlesToVisit.length} articles. Now processing each in a new tab to scrape dates.`);

    const finalProcessedArticles = [];

    for (let i = 0; i < articlesToVisit.length; i++) {
      const article = articlesToVisit[i];
      let newTab;

      try {
        newTab = await browser.newPage();
        console.log(`- Opening new tab for article ${i + 1}/${articlesToVisit.length}: ${article.url}`);
        await newTab.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        let date = null;
        try {
          await newTab.waitForSelector(articlePageDateSelector, { timeout: 15000 });
          date = await newTab.evaluate((dateSel) => {
            const dateEl = document.querySelector(dateSel);
            return dateEl ? dateEl.textContent.trim() : null;
          }, articlePageDateSelector);
          console.log(`  Scraped Date: ${date || 'N/A'}`);
        } catch (dateErr) {
          console.warn(`  Warning: Could not find date for "${article.title}" on its page: ${dateErr.message}`);
          date = null;
        }
        
        const articleWithDate = { ...article, date };
        console.log(`- Closing tab for: "${article.title}"`);
        await newTab.close();
        
        finalProcessedArticles.push(articleWithDate);
      } catch (err) {
        console.error(`Error processing tab for article "${article.title}" (${article.url}): ${err.message}`);
        finalProcessedArticles.push({ ...article, date: null, status: `Error visiting/processing: ${err.message}` });
        if (newTab) {
          await newTab.close().catch(e => console.error(`Error closing errored tab: ${e.message}`));
        }
      }
    }

    await mainPage.close();
    
    console.log(`\n-----------------------------------`);
    console.log(`Final Scraped Data:`);
    console.log(JSON.stringify(finalProcessedArticles, null, 2));
    console.log(`-----------------------------------`);
    
    console.log(`Total articles successfully processed: ${finalProcessedArticles.length}`);
    
    const filename = 'scraped_apnews.json';
    fs.writeFileSync(filename, JSON.stringify(finalProcessedArticles, null, 2), 'utf8');
    console.log(`Data saved to ${filename}`);

  } catch (err) {
    console.error('An unhandled error occurred during the main scraping process:', err.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}

main();