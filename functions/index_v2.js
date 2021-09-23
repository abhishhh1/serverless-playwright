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

const ENTITY_REGEX = {
    linkedin: ['linkedin', 'Linkedin'],
    facebook: ['facebook', 'Facebook', 'fb', 'FB'],
    twitter: ['twitter', 'Twitter'],
    instagram: ['instagram', 'Instagram'],
    youtube: ['youtube', 'Youtube'],
    snapchat: ['snapchat', 'Snapchat'],
    github: ['github', 'Github', 'Git', 'git', 'repo'],
    play_store: ['play', 'Play', 'android', 'Android'],
    app_store: ['app', 'App', 'apple', 'Apple', 'iOS', 'ios', 'IOS'],
    apple_store: ['app', 'App', 'apple', 'Apple', 'iOS', 'ios', 'IOS']
};

function redirectionChain(url, response) {
    response = response.request()
    redirections = [response.url()]
    while (response.url() != url) {
        redirections.push(response.redirectedFrom().url());
        response = response.redirectedFrom()
    }
    return redirections;
}

function extractFromUrls(browser, page) {
    return new Promise(async (resolve, reject) => {
        try{
            var entities={};
            var elementHrefs = await page.$$eval('a', as => as.map(tag => tag.getAttribute('href') || '#'));
            for (var i = 0; i < elementHrefs.length; i++) {
                var matched = false;
                for (const [key, value] of Object.entries(ENTITY_FORMATS)) {
                    entities[key] ||= [];
                    if (elementHrefs[i].includes(value)) {
                        entities[key].push(elementHrefs[i]);
                        matched = true;
                    }
                }
                if (matched) continue
                if (elementHrefs[i] && elementHrefs[i].startsWith("http") && !elementHrefs[i].startsWith(page.url())) {
                    const newPage = await browser.newPage();
                    newPage.setDefaultTimeout(0);
                    try{
                        await newPage.goto(elementHrefs[i]);
                        await newPage.waitForNavigation({timeout: 2000});
                    }catch(error){}
                    let pageUrl = await newPage.url();
                    for (const [key, value] of Object.entries(ENTITY_FORMATS)) {
                        if (pageUrl.includes(value)) {
                            entities[key].push(pageUrl);
                        }
                    }
                    await newPage.close();
                }
            }
            resolve(entities);
        }
        catch(error){
            reject("Something went wrong!!");
        }
    });
}

function fetchFromClick(key, value, page) {
    return new Promise(async (resolve, reject) => {
        var hrefs = [];
        for (var i = 0; i < ENTITY_REGEX[key].length; i++) {
            const imageCSS = 'img[alt*="' + ENTITY_REGEX[key][i] + '"]';
            let element = await page.$(imageCSS);
            if (element) {
                try {
                    //click on the image element with popup
                    const [newPage] = await Promise.all([
                        page.waitForEvent('popup', { timeout: 15000 }),
                        page.click(imageCSS, { force: true, timeout: 2000 })
                    ]);
                    let pageUrl = newPage.url();
                    if (pageUrl.includes(value)) {
                        hrefs.push(pageUrl);
                    }
                    await newPage.close();
                }
                catch (TimeoutError) {}
            }
        }
        resolve(hrefs);
    });
}

async function extract(url) {
    const browser = await playwright.chromium.launch({
        headless: false
    });

    const context = await browser.newContext({
        locale: 'en-GB',
        geolocation: { longitude: 48.858455, latitude: 2.294474 },
        permissions: ['geolocation']
    })

    const page = await browser.newPage();
    page.setDefaultTimeout(0);
    const response = await page.goto(url, { waitUntil: 'networkidle' });

    await page.on('dialog', async (dialog) => {
        await dialog.dismiss();
    });

    const chain = redirectionChain(url, response);

    var entities = {};
    await Promise.all([
        extractFromUrls(browser, page)
    ]).then(async (data) => {
        entities = data[0];
        for (const [key, value] of Object.entries(ENTITY_FORMATS)) {
            if(entities[key].length == 0){
                Promise.all(
                    await fetchFromClick(key,value,page)
                ).then((hrefs) => {
                    entities[key] = [...new Set(hrefs)];
                })
            }
            else{
                entities[key] = [...new Set(entities[key])];
            }
        }
    }).catch((message) =>{
        console.log(message);
    })

    //modify entities
    entities['redirection_chain'] = chain;
    entities['app_store'] = [...new Set(entities['app_store'].concat(entities['apple_store']))];
    delete entities['apple_store'];
    console.log(entities);

    await page.close();
    await context.close();
    await browser.close();
}

extract("http://glowroad.com/");