const playwright = require('playwright');

const ENTITY_FORMATS = {
  linkedin: 'linkedin.com/company/',
  facebook: 'facebook.com/',
  twitter: 'twitter.com/',
  instagram: 'instagram.com/',
  youtube: 'youtube.com/channel/',
  snapchat: 'snapchat.com/',
  github: 'github.com/',
  play_store: 'play.google.com/store/',
  apple_store: 'apps.apple.com/',
  app_store: 'itunes.apple.com/'
};

const ENTITY_REGEX ={
  linkedin: ['linkedin', 'Linkedin'],
  facebook: ['facebook', 'Facebook'],
  twitter: ['twitter', 'Twitter'],
  instagram: ['instagram', 'Instagram'],
  youtube: ['youtube', 'Youtube'],
  snapchat: ['snapchat', 'Snapchat'],
  github: ['github', 'Github', 'Git', 'git', 'repo'],
  play_store: ['play','Play', 'android', 'Android'],
  app_store: ['app', 'App', 'apple', 'Apple', 'iOS', 'ios', 'IOS'],
  apple_store: ['app', 'App', 'apple', 'Apple', 'iOS', 'ios', 'IOS']
};

async function crawl_entities(url) {
    const browser = await playwright.chromium.launch({
        headless: true
    });

    const context = await browser.newContext({
        locale: 'en-GB',
        geolocation: { longitude: 48.858455, latitude: 2.294474 },
        permissions: ['geolocation']
    });

    const page = await browser.newPage();
    var response = await page.goto(url);

    await page.on('dialog', async (dialog) => {
        await dialog.dismiss();
    });

    response = response.request()
    redirections = [response.url()]
    while (response.url() != url) {
         redirections.push(response.redirectedFrom().url());
         response = response.redirectedFrom()
    }

    entities = {};
    for (const [key, value] of Object.entries(ENTITY_FORMATS)) {
        const href_css = '[href*="'+value+ '"]';
        var hrefs = await page.$$eval(href_css, as => as.map(tag => tag.getAttribute('href')));
        //link in on-click event
        if(hrefs.length == 0){
            for(var i=0; i<ENTITY_REGEX[key].length; i++){
                const image_css = 'img[alt*="'+ENTITY_REGEX[key][i]+'"]';
                let element = await page.$(image_css);
                var page_url='';
                if(element){
                    try{
                        //click on the image element with popup
                        const [new_page] = await Promise.all([
                            page.waitForEvent('popup', {timeout: 15000}),
                            page.click(image_css, {force: true, timeout: 2000})
                        ]);
                        page_url = new_page.url();
                        await new_page.close();
                    }
                    catch(TimeoutError){
                        //find parent anchor tag
                        var tag = await element.evaluate(e => e.tagName);
                        while( tag != 'A'){
                            element = await element.$('xpath=..');
                            tag = await element.evaluate(e => e.tagName);
                            if(tag == 'BODY'){
                                break;
                            }
                        }
                        try{
                            //click on anchor element with popup
                            const [new_page] = await Promise.all([
                                element.waitForEvent('popup', {timeout: 15000}),
                                element.click({force: true, timeout: 2000})
                            ]);
                            page_url = new_page.url();
                            await new_page.close();
                        }
                        catch(TimeoutError){
                            try{
                                //click on anchor element without popup
                                const [new_page] = await Promise.all([
                                    element.waitForNavigation({timeout: 15000}),
                                    element.click({force: true, timeout: 2000})
                                ]);
                                page_url = new_page.url();
                                await new_page.close();
                            }
                            catch(TimeoutError){
                                //try running for href and get url
                                const elementHref = await element.getAttribute('href');
                                if (elementHref.startsWith("http")){
                                    const new_page = await browser.newPage();
                                    await new_page.goto(elementHref);
                                    page_url = await new_page.url();
                                    await new_page.close();
                                }
                            }
                        }
                    }
                }
                if (page_url.includes(ENTITY_FORMATS[key])){
                    hrefs.push(page_url);
                }
            }
        }
        entities[key] = [...new Set(hrefs)];
    }
    entities['redirection_chain'] = redirections;
    entities['app_store'] = [...new Set(entities['app_store'].concat(entities['apple_store']))];
    delete entities['apple_store'];
    console.log(entities);

    await page.close();
    await context.close();
    await browser.close();
}

exports.handler = async function(event, context) {
  const queryParams = event.queryStringParameters;
  const url = queryParams.url;
  const crawled_entities = await crawl_entities(url);
  return {
    statusCode: 200,
    body: JSON.stringify({
      status: 'Ok',
      data: {
        crawled_entities
      }
    })
  };
}