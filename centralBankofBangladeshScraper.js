const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

let delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  let browser; // Define browser here

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: chromium.executablePath,
      headless: chromium.headless,
    });
    const page = await browser.newPage();

    const url = "https://www.bb.org.bd/en/index.php/mediaroom/circular";

    console.log("Navigating to BB Circulars page...");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    console.log("Selecting Sustainable Finance Department from dropdown...");
    await page.select("#cboDept", "61");

    console.log("Clicking Search button...");
    await page.click('input[name="search_circular"]');
    await delay(5000);

    console.log("Scraping filtered results...");
    const articles = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("#sortableTable tbody tr"));
      return rows.map((row) => {
        const cells = row.querySelectorAll("td");

        const date = cells[0]?.textContent.trim() || null;
        const title = cells[1]?.textContent.trim() || null;

        let url = null;
        const indexToUse = cells[2]?.textContent.trim() === "Not Available" ? 3 : 2;

        if (cells[indexToUse]) {
          const linkEl = cells[indexToUse].querySelector("a.pdf-file");
          if (linkEl && linkEl.hasAttribute("pdf-link")) {
            url = linkEl.getAttribute("pdf-link");
          } else {
            url = cells[indexToUse].textContent.trim();
          }
        }

        return { date, title, url };
      }).filter((item) => item.date && item.title);
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