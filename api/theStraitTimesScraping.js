const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
async function scrapeArticles() {
    console.log('1. Starting program...');
    // Launch the browser (you'll see this window open!)
    console.log('2. Launching browser...');
    const browser = await puppeteer.launch({
        headless: false, // Set to true later if you want it hidden
        slowMo: 50      // Makes actions slower so you can see what's happening
    });
    console.log('3. Browser launched successfully!');
    try {
        // Create a new page
        console.log('4. Creating new page...');
        const page = await browser.newPage();
        // Go to Straits Times Climate Change section
        console.log('5. Navigating to Climate Change section...');
        await page.goto('https://www.straitstimes.com/tags/climate-change', {
            waitUntil: 'networkidle2',  // Wait for most network requests to finish
            timeout: 60000              // Give it 60 seconds to load
        });
        console.log('6. Navigation complete!');
        // Take a screenshot to see what's loading
        console.log('7. Taking screenshot...');
        await page.screenshot({ path: 'page-screenshot.png' });
        console.log('Screenshot saved as page-screenshot.png');
        // Wait for article elements to load
        console.log('8. Waiting for article elements...');
        await page.waitForSelector('xpath=/html/body/div[5]/div/div[1]/main/div/div[1]/div/a[1]');
        
        // /html/body/div[5]/div/div[1]/main/div/div[1]/div/a[1]
        // /html/body/div[5]/div/div[1]/main/div/div[1]/div/a[2]
        // therefore increase by a[i]
        
        // Find all article links using XPATH
        console.log('10. Finding article links...');
        const articleLinks = [];

        for (let j = 0; j < 10; j++) {
            var xpath = `xpath=/html/body/div[5]/div/div[1]/main/div/div[1]/div/a[${j+1}]`;
            var elements = await page.$$(xpath);
            if (elements.length > 0) {
                articleLinks.push(elements[0]);
            }
        }
        
        if (articleLinks.length === 0) {
            console.log('11. No article links found!');
            return;
        }
        console.log(`11. Found ${articleLinks.length} article links!`);
        // Create array to store articles
        const articles = [];
        // Process each article link
        for (let i = 0; i < articleLinks.length; i++) {
            console.log(`\n12. Processing article ${i + 1} of ${articleLinks.length}...`);
            // Get title and URL from link
            const title = await page.evaluate(el => {
                const titleElement = el.querySelector('[data-testid="subsection-title"]');
                return titleElement ? titleElement.textContent.trim() : '';
            }, articleLinks[i]);
            const url = await page.evaluate(el => el.getAttribute('href'), articleLinks[i]);
            // Click the link to get to the article page
            console.log('13. Navigating to article page...');
            const newPage = await browser.newPage();
            try {
                await newPage.goto(`https://www.straitstimes.com${url}`, {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });
                // Get date from article page
                console.log('14. Extracting date from article page...');
                await newPage.waitForSelector('xpath=/html/body/div[5]/div[1]/main/div[1]/article/section[1]/div[3]/div[1]');
                const dateElement = await newPage.$('xpath=/html/body/div[5]/div[1]/main/div[1]/article/section[1]/div[3]/div[1]');
                if (dateElement.length === 0) {
                    console.warn(`Could not find date element for article ${i + 1}. Using empty string.`);
                    const date = '';
                    articles.push({
                        title,
                        date,
                        url: `https://www.straitstimes.com${url}`
                    });
                } else {
                    const date = await newPage.evaluate(el => el.textContent.trim(), dateElement);
                    articles.push({
                        title,
                        date,
                        url: `https://www.straitstimes.com${url}`
                    });
                }
            } catch (error) {
                console.error(`Error processing article ${i + 1}: ${error.message}`);
                articles.push({
                    title,
                    date: '',
                    url: `https://www.straitstimes.com${url}`
                });
            } finally {
                await newPage.close();
            }
        }
        // Create XML string
        console.log('\n15. Creating XML string...');
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<articles>\n`;
        // Add each article to XML
        articles.forEach(article => {
            xml += `<article>\n    <title>${article.title}</title>\n    <date>${article.date || ''}</date>\n    <url>${article.url}</url>\n</article>\n`;
        });
        xml += `</articles>\n`;
        // Get current working directory
        const currentDir = process.cwd();
        console.log(`\nCurrent working directory: ${currentDir}`);
        // Save to file
        console.log('16. Saving XML file...');
        const filename = 'climate-change-articles.xml';
        const fullPath = path.join(currentDir, filename);
        // Try to save the file
        try {
            fs.writeFileSync(fullPath, xml, 'utf8');
            console.log(`\nXML file saved at: ${fullPath}`);
            console.log('File size:', fs.statSync(fullPath).size, 'bytes');
        } catch (error) {
            console.error('Error saving file:', error.message);
        }
        // Show results nicely formatted
        console.log('\n:newspaper: Climate Change Articles Found:');
        articles.forEach((article, index) => {
            console.log(`\n${index + 1}. ${article.title}`);
            console.log(`   Date: ${article.date || 'No date found'}`);
            console.log(`   URL: ${article.url}`);
        });
        console.log(`\nTotal climate change articles scraped: ${articles.length}`);
    } catch (error) {
        console.error('An error occurred:', error.message);
    } finally {
        // Close the browser after 30 seconds
        console.log('\n17. Closing browser...');
        setTimeout(async () => {
            await browser.close();
        }, 30000);
    }
}
// Run the scraper
console.log('Starting climate change articles scraper...');
scrapeArticles();
