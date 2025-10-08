const scrapedData = await page.evaluate((maxArticles) => {
    const results = [];
    // Find all elements that represent an article container.
    // <--- REPLACE THIS SELECTOR with the actual article container selector
    const articleElements = document.querySelectorAll('div.mb-6.pb-6');

    if (articleElements.length === 0) {
        console.warn("DIAGNOSTIC (Inner): No <article> elements found with the specified main selector.");
        console.warn("DIAGNOSTIC (Inner): Please ensure this selector is correct and the content is loaded on the page.");
        return [];
    } else {
        console.log(`DIAGNOSTIC (Inner): Found ${articleElements.length} potential article elements.`);
    }

    for (let i = 0; i < Math.min(articleElements.length, maxArticles); i++) {
        const articleElement = articleElements[i];


        // Extract Title
        // <--- REPLACE THIS SELECTOR
        const titleElement = articleElement.querySelector('article.media-block > div.media-block__content > h3.media-block__title > a > span');
        const title = titleElement ? titleElement.innerText.trim() : 'N/A';
        
        // Extract Date
        // <--- REPLACE THIS SELECTOR
        const dateElement = articleElement.querySelector('article.media-block > div.media-block__content > div.media-block__info > span.media-block__date');
        const date = dateElement ? dateElement.textContent.replace(/\s+/g, ' ').trim() : 'N/A';

        // Extract Link
        // <--- REPLACE THIS SELECTOR
        const linkElement = articleElement.querySelector('article.media-block > div.media-block__content > h3.media-block__title > a');
        // Use window.location.origin to ensure absolute URLs
        const link = linkElement ? new URL(linkElement.getAttribute('href'), window.location.origin).href : 'N/A';

        results.push({
            title: title,
            url: link,
            date: date,
        });
    }
    return results;
}, maxArticles); // Pass maxArticles to the page.evaluate context

articles.push(...scrapedData);