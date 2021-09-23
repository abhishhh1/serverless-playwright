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

function extractUrls(key, value, browser, page) {
    return new Promise(async (resolve, reject) => {
        const hrefCSS = '[href*="' + value + '"]';
        var hrefs = await page.$$eval(hrefCSS, as => as.map(tag => tag.getAttribute('href')));
        if (hrefs.length == 0) {
            for (var i = 0; i < ENTITY_REGEX[key].length; i++) {
                const imageCSS = 'img[alt*="' + ENTITY_REGEX[key][i] + '"]';
                let element = await page.$(imageCSS);
                if (element) {
                    var tag = await element.evaluate(e => e.tagName);
                    while (tag != 'A') {
                        element = await element.$('xpath=..');
                        tag = await element.evaluate(e => e.tagName);
                        if (tag == 'BODY') {
                            break;
                        }
                    }
                    const elementHref = await element.getAttribute('href');
                    if (elementHref && elementHref.startsWith("http")) {
                        const newPage = await browser.newPage();
                        await newPage.goto(elementHref, {waitUntil: 'networkidle'});
                        try{
                            await newPage.waitForNavigation({timeout: 5000});
                        }catch(TimeoutError){}
                        let pageUrl = await newPage.url();
                        if (pageUrl.includes(value)) {
                            hrefs.push(pageUrl);
                        }
                        await newPage.close();
                    }
                }
            }
        }
        if (hrefs.length > 0) {
            resolve(hrefs);
        }
        else {
            reject(fetchFromClickOnPopup);
        }
    });
}

function fetchFromClickOnPopup(key, value, page) {
    return new Promise(async (resolve, reject) => {
        var hasError = false;
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
                catch (TimeoutError) {
                    hasError = true;
                }
            }
        }
        if (!hasError) {
            resolve(hrefs);
        }
        else {
            reject(fetchFromClickOnNavigation);
        }
    });
}

function fetchFromClickOnNavigation(key, value, page) {
    return new Promise(async (resolve, reject) => {
        for (var i = 0; i < ENTITY_REGEX[key].length; i++) {
            var hrefs = [];
            const imageCSS = 'img[alt*="' + ENTITY_REGEX[key][i] + '"]';
            var element = await page.$(imageCSS);
            if (element) {
                try {
                    //click on the image element with popup
                    const [newPage] = await Promise.all([
                        page.waitForNavigation({ timeout: 15000 }),
                        page.click(imageCSS, { force: true, timeout: 2000 })
                    ]);
                    let pageUrl = newPage.url();
                    if (pageUrl.includes(value)) {
                        hrefs.push(pageUrl);
                    }
                    await newPage.close();
                }
                catch (TimeoutError) { }
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
    page.setDefaultTimeout(60000);
    const response = await page.goto(url, { waitUntil: 'networkidle' });

    await page.on('dialog', async (dialog) => {
        await dialog.dismiss();
    });

    const chain = redirectionChain(url, response);

    var entities = {};
    for (const [key, value] of Object.entries(ENTITY_FORMATS)) {
        await Promise.all([
            extractUrls(key, value, browser, page)
        ]).then((hrefs) => {
            entities[key] = [...new Set(hrefs[0])];
        })
        .catch(async (callback) => {
            await Promise.all([
                callback(key, value, page)
            ])
            .then((hrefs) => {
                entities[key] = [...new Set(hrefs[0])];
            })
            .catch(async (callback) => {
                await Promise.all([
                    callback(key, value, page)
                ])
                .then((hrefs) => {
                    entities[key] = [...new Set(hrefs[0])];
                })
            });
        })
    }

    //modify entities
    entities['redirection_chain'] = chain;
    entities['app_store'] = [...new Set(entities['app_store'].concat(entities['apple_store']))];
    delete entities['apple_store'];
    console.log(entities);

    await page.close();
    await context.close();
    await browser.close();
}

extract("https://grofers.com/");
