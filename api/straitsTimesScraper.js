const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function straitTimesScraper() {
    const browser = await puppeteer.launch({
        headless: true,
        slowMo: 50
    });

    try {
        const page = await browser.newPage();
        await page.goto('https://www.straitstimes.com/tags/climate-change', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        await page.waitForSelector('xpath=/html/body/div[5]/div/div[1]/main/div/div[1]/div/a[1]');

        const articleLinks = [];

        for (let j = 0; j < 10; j++) {
            const xpath = `xpath=/html/body/div[5]/div/div[1]/main/div/div[1]/div/a[${j + 1}]`;
            const elements = await page.$$(xpath);
            if (elements.length > 0) {
                articleLinks.push(elements[0]);
            }
        }

        if (articleLinks.length === 0) {
            return;
        }

        const articles = [];

        for (let i = 0; i < articleLinks.length; i++) {
            const title = await page.evaluate(el => {
                const titleElement = el.querySelector('[data-testid="subsection-title"]');
                return titleElement ? titleElement.textContent.trim() : '';
            }, articleLinks[i]);

            const url = await page.evaluate(el => el.getAttribute('href'), articleLinks[i]);

            const newPage = await browser.newPage();

            try {
                await newPage.goto(`https://www.straitstimes.com${url}`, {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });

                await newPage.waitForSelector('xpath=/html/body/div[5]/div[1]/main/div[1]/article/section[1]/div[3]/div[1]');
                const dateElement = await newPage.$('xpath=/html/body/div[5]/div[1]/main/div[1]/article/section[1]/div[3]/div[1]');
                
                let date = '';
                if (dateElement) {
                    date = await newPage.evaluate(el => el.textContent.trim(), dateElement);
                }

                articles.push({
                    title,
                    date,
                    url: `https://www.straitstimes.com${url}`
                });

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

        // Deduplicate by title
        const seenTitles = new Set();
        const deduplicated = articles.filter(article => {
            if (seenTitles.has(article.title)) return false;
            seenTitles.add(article.title);
            return true;
        });

        const filename = 'straitTimes.json';
        const fullPath = path.join(process.cwd(), filename);

        try {
            fs.writeFileSync(fullPath, JSON.stringify(deduplicated, null, 2), 'utf8');
            console.log(`\nJSON file saved at: ${fullPath}`);
        } catch (error) {
            console.error('Error saving file:', error.message);
        }

    } catch (error) {
        console.error('An error occurred:', error.message);
    } finally {
        setTimeout(async () => {
            await browser.close();
        }, 30000);
    }
}

straitTimesScraper();
