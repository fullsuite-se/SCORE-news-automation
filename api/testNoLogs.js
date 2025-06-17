 // Deduplicate based on unique URLs
      const seen = new Set();
      return rawArticles.filter(article => {
        if (seen.has(article.url)) return false;
        seen.add(article.url);
        return true;
      });

        const fullPath = path.join(process.cwd(), filename);
        console.log(`\nJSON file saved at: ${fullPath}`);

      //other deduplication
         const uniqueKey = `${title}||${url}`;
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          results.push({ title, url, date });
        }

        