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

    const url = "https://www.centralbank.go.ke/press/";

    console.log("Navigating to Central Bank of Kenya press page...");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    console.log("Typing \"Disclosure\" into the search bar...");
    await page.type('input[type="search"][aria-controls="table_1"]', "Disclosure");
    await delay(5000); // Wait for the DataTables to filter and redraw

    console.log("Scraping only visible filtered rows...");
    const articles = await page.evaluate(() => {
      const table = document.querySelector("#table_1");
      if (!table || table.style.display === "none") return [];

      const visibleRows = Array.from(table.querySelectorAll("tbody tr")).filter(
        (row) => row.offsetParent !== null
      );
      return visibleRows
        .map((row) => {
          const titleEl = row.querySelector("td.pdf_link a");
          const dateEl = row.querySelector("td.date.sorting_1");

          const title = titleEl ? titleEl.textContent.trim() : null;
          const url = titleEl ? titleEl.href : null;
          const date = dateEl ? dateEl.textContent.trim() : null;

          return { title, url, date };
        })
        .filter((article) => article.title && article.url && article.date);
    });

    if (articles.length === 0) {
      console.log("No articles found.");
      return;
    }

    const output = JSON.stringify(articles.slice(0, 10), null, 2);
    console.log(output);
    console.log(`Number of articles saved: ${articles.length}`);
  } catch (err) {
    console.error("Error during scraping:", err.message);
  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
    }
  }
})();
