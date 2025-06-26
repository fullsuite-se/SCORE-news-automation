import puppeteer from 'puppeteer';

const asciiPotato = `
       ___
     .'   '.
    /       \\
   |         |
   |         |
    \\       /
     '.   .'
       """
     (POTATO)
`;

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Set a blank HTML page with styling
  await page.setContent(`
    <html>
      <head><title>ASCII Potato</title></head>
      <body style="background:#1e1e1e; color:#c2b280; font-family:monospace; white-space:pre; font-size:16px; padding:20px;">
        <div id="art"></div>
      </body>
    </html>
  `);

  // Inject the ASCII art into the page
  await page.evaluate((art) => {
    document.getElementById('art').textContent = art;
  }, asciiPotato);

  console.log('Potato is ready.');

  // Keeps the page open
})();
