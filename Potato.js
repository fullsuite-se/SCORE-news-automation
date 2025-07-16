import puppeteer from 'puppeteer'; // Standard ES module import for local scripts

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
  // Launch Puppeteer with updated headless option for modern Chromium
  const browser = await puppeteer.launch({ 
    headless: false, // Keep false if you want to see the browser window
    // For true headless, you would use: headless: 'new',
    // For older headless, you would use: headless: true,
  });
  const page = await browser.newPage();

  // Set a blank HTML page with styling
  await page.setContent(`
    <html>
      <head>
        <title>ASCII Potato</title>
        <style>
          body {
            background:#1e1e1e; 
            color:#c2b280; 
            font-family:monospace; 
            white-space:pre; 
            font-size:16px; 
            padding:20px;
          }
        </style>
      </head>
      <body>
        <div id="art"></div>
      </body>
    </html>
  `);

  // Inject the ASCII art into the page
  await page.evaluate((art) => {
    document.getElementById('art').textContent = art;
  }, asciiPotato);

  console.log('Potato is ready.');

  // Keeps the page open.
  // In a real application, you'd usually close the browser after tasks are done.
  // For this example, it stays open until you manually close the browser window.
  // If headless: true or 'new', the script would exit after execution.
})();