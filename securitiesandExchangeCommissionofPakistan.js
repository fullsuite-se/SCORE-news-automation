const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

let delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  let browser;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: chromium.executablePath,
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    const url = "https://www.secp.gov.pk/media-center/press-releases/";

    console.log("Navigating to SECP press releases page...");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    const closePopupSelector = "#sgpb-close-button";
    const popupExists = await page.$(closePopupSelector);
    if (popupExists) {
      console.log("Closing popup...");
      await page.click(closePopupSelector);
    }

    const searchSelector = 'div#DataTables_Table_0_filter input[type="search"]';
    await page.waitForSelector(searchSelector, { timeout: 15000 });
    console.log('Typing "Sustainability" into search bar...');
    await page.type(searchSelector, "Sustainability");

    console.log("Waiting 5 seconds after search...");
    await delay(5000);

    console.log("Scraping filtered articles...");
    const articles = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll("tbody tr.download-row-table")
      ).filter((row) => row.offsetParent !== null);
      return rows
        .slice(0, 10)
        .map((row) => {
          const titleEl = row.querySelector("td.download-title");
          const linkEl = row.querySelector("td.download-link a");
          const dateEl = row.querySelector("td.download-date");

          const title = titleEl ? titleEl.textContent.trim() : null;
          const url = linkEl ? linkEl.href : null;
          const date = dateEl ? dateEl.textContent.trim() : null;

          return { title, url, date };
        })
        .filter((article) => article.title && article.url && article.date);
    });

    if (articles.length === 0) {
      console.log("No articles found.");
    } else {
      console.log(`Found ${articles.length} articles.`);
      const output = JSON.stringify(articles, null, 2);
      console.log(output);
    }
  } catch (err) {
    console.error("Error during scraping:", err.message);
  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
    }
  }
})();