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

async function redirection_chains(url){
    response = response.request()
    redirections = [response.url()]
    while (response.url() != url) {
         redirections.push(response.redirectedFrom().url());
         response = response.redirectedFrom()
    }
    return redirections;
}

async function crawl_entities(url) {
    const hrefs = await page.$$eval('a', as => as.map(a => a.href));
    entities = {};
    for (const [key, value] of Object.entries(ENTITY_FORMATS)) {
        data = [];
        hrefs.forEach((href) => {
            if(typeof href == 'string' && href.includes(value)){
                data.push(href);
            }
        });
        entities[key] = [...new Set(data)];
    }
    entities['app_store'] = [...new Set(entities['app_store'].concat(entities['apple_store']))];
    delete entities['apple_store'];
    return entities;
}

exports.handler = async function(event, context) {
  url="http://synaptic.io/";
  const browser = await playwright.chromium.launch({
      headless: true 
  });
  page = await browser.newPage();
  response = await page.goto(url);
  const redirection_chain = await redirection_chains(url)
  const crawled_entities = await crawl_entities(url);
  await browser.close();
  return {
    statusCode: 200,
    body: JSON.stringify({
      status: 'Ok',
      data: {
        redirection_chain,
        crawled_entities
      }
    })
  };
}