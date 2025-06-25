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
    const baseUrl = "https://rbi.org.in";
    const url = `${baseUrl}/scripts/SearchResults.aspx?search=Disclosure+Framework`;

    console.log("Navigating to RBI search page...");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    console.log("Selecting \"Title of document\"...");
    await page.select("select#ddlSearchField", "0");

    console.log("Clicking Update Result button...");
    await Promise.all([
      page.click("input#btnUpdate"),
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
    ]);

    console.log("Waiting for content...");
    await page.waitForSelector("a.sub_title2_link", { timeout: 15000 });

    console.log("Scraping...");
    const articles = await page.evaluate(() => {
      const base = "https://rbi.org.in";
      const links = Array.from(document.querySelectorAll("a.sub_title2_link"));
      const details = Array.from(document.querySelectorAll("div.sub_title2_detail"));

      return links
        .slice(0, 10)
        .map((link, index) => {
          const titleEl = link.querySelector("h3.sub_title2");
          const title = titleEl ? titleEl.textContent.trim() : null;

          const href = link.getAttribute("href");
          const url = href ? base + href : null;

          const dateEl = details[index];
          const date = dateEl ? dateEl.textContent.trim() : null;

          return { title, url, date };
        })
        .filter((item) => item.title && item.url && item.date);
    });

    if (articles.length === 0) {
      console.log("No articles found.");
    } else {
      console.log(`Found ${articles.length} articles.`);
      const output = JSON.stringify(articles, null, 2);
      console.log(output);
    }

    console.log("Waiting 5 seconds before closing...");
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