const playwright = require('playwright');
exports.handler = async function(event, context) {
    const browser = await playwright.chromium.launch({
        headless: true 
    });
    
    const page = await browser.newPage();
    response = await page.goto("https://spacejelly.dev/");
    await page.focus('#search-query')
    await page.keyboard.type('api');
    const results = await page.$$eval('#search-query + div a', (links) => {
        return links.map(link => {
          return {
            text: link.innerText,
            href: link.href
          }
        });
    });
      
    return {
        statusCode: 200,
        body: JSON.stringify({
        status: 'Ok',
        results
        })
    };
  }