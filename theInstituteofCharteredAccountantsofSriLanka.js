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
    const url = "https://www.casrilanka.com/casl/index.php?option=com_content&view=category&id=50&Itemid=156&lang=en";

    console.log("Navigating to CASL site...");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    console.log("Typing \"Sustainability\" in search bar...");
    await page.type('input[name="filter"]', "Sustainability");
    await page.keyboard.press("Enter");

    await delay(5000);

    console.log("Scraping articles...");
    const articles = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll("tr.sectiontableentry1, tr.sectiontableentry2")
      );

      return rows
        .slice(0, 10)
        .map((row) => {
          const linkEl = row.querySelector("td a");
          const tds = row.querySelectorAll("td");

          const title = linkEl ? linkEl.textContent.trim() : null;
          const url = linkEl ? linkEl.getAttribute("href") : null;
          const date = tds.length > 2 ? tds[2].textContent.trim() : null;

          return { title, url, date };
        })
        .filter((article) => article.title && article.url);
    });

    if (articles.length === 0) {
      console.log("No articles found.");
    } else {
      const output = JSON.stringify(articles, null, 2);
      console.log(output);
      console.log("Number of articles saved:", articles.length);
    }

    await delay(5000);
  } catch (err) {
    console.error("Error during scraping:", err.message);
  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
    }
  }
})();