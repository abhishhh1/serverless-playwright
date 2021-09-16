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
    facebook: ['facebook', 'Facebook'],
    twitter: ['twitter', 'Twitter'],
    instagram: ['instagram', 'Instagram'],
    youtube: ['youtube', 'Youtube'],
    snapchat: ['snapchat', 'Snapchat'],
    github: ['github', 'Github', 'Git', 'git', 'repo'],
    play_store: ['play', 'Play', 'android', 'Android'],
    app_store: ['app', 'App', 'apple', 'Apple', 'iOS', 'ios', 'IOS'],
    apple_store: ['app', 'App', 'apple', 'Apple', 'iOS', 'ios', 'IOS']
};

function redirection_chain(url, response) {
    response = response.request()
    redirections = [response.url()]
    while (response.url() != url) {
        redirections.push(response.redirectedFrom().url());
        response = response.redirectedFrom()
    }
    return redirections;
}

function extract_urls(key, value, browser, page) {
    return new Promise(async (resolve, reject) => {
        const href_css = '[href*="' + value + '"]';
        var hrefs = [];
        hrefs = await page.$$eval(href_css, as => as.map(tag => tag.getAttribute('href')));
        if (hrefs.length == 0) {
            for (var i = 0; i < ENTITY_REGEX[key].length; i++) {
                const image_css = 'img[alt*="' + ENTITY_REGEX[key][i] + '"]';
                let element = await page.$(image_css);
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
                        const new_page = await browser.newPage();
                        await new_page.goto(elementHref);
                        let page_url = await new_page.url();
                        if (page_url.includes(value)) {
                            hrefs.push(page_url);
                        }
                        await new_page.close();
                    }
                }
            }
        }
        if (hrefs.length > 0) {
            resolve(hrefs);
        }
        else {
            reject(fetch_from_click_on_popup);
        }
    });
}

function fetch_from_click_on_popup(key, value, page) {
    return new Promise(async (resolve, reject) => {
        var has_error = false;
        var hrefs = [];
        for (var i = 0; i < ENTITY_REGEX[key].length; i++) {
            const image_css = 'img[alt*="' + ENTITY_REGEX[key][i] + '"]';
            let element = await page.$(image_css);
            if (element) {
                try {
                    //click on the image element with popup
                    const [new_page] = await Promise.all([
                        page.waitForEvent('popup', { timeout: 15000 }),
                        page.click(image_css, { force: true, timeout: 2000 })
                    ]);
                    let page_url = new_page.url();
                    console.log
                    if (page_url.includes(value)) {
                        hrefs.push(page_url);
                    }
                    await new_page.close();
                }
                catch (TimeoutError) {
                    has_error = true;
                }
            }
        }
        if (!has_error) {
            resolve(hrefs);
        }
        else {
            reject(fetch_from_click_on_navigation);
        }
    });
}

function fetch_from_click_on_navigation(key, value, page) {
    return new Promise(async (resolve, reject) => {
        for (var i = 0; i < ENTITY_REGEX[key].length; i++) {
            var hrefs = [];
            const image_css = 'img[alt*="' + ENTITY_REGEX[key][i] + '"]';
            var element = await page.$(image_css);
            if (element) {
                try {
                    //click on the image element with popup
                    const [new_page] = await Promise.all([
                        page.waitForNavigation({ timeout: 15000 }),
                        page.click(image_css, { force: true, timeout: 2000 })
                    ]);
                    let page_url = new_page.url();
                    if (page_url.includes(value)) {
                        hrefs.push(page_url);
                    }
                    await new_page.close();
                }
                catch (TimeoutError) { }
            }
        }
        resolve(hrefs);
    });
}

exports.handler = async function (event, context) {
    const queryParams = event.queryStringParameters;
    const url = queryParams.url;
    const browser = await playwright.chromium.launch({
        headless: true
    });

    const browserContext = await browser.newContext({
        locale: 'en-GB',
        geolocation: { longitude: 48.858455, latitude: 2.294474 },
        permissions: ['geolocation']
    })

    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    const response = await page.goto(url);

    await page.on('dialog', async (dialog) => {
        await dialog.dismiss();
    });

    const chain = redirection_chain(url, response);

    var entities = {};
    for (const [key, value] of Object.entries(ENTITY_FORMATS)) {
        await Promise.all([
            extract_urls(key, value, browser, page)
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
    await browserContext.close();
    await browser.close();
    return {
        statusCode: 200,
        body: JSON.stringify({
            status: 'Ok',
            data: {
                entities
            }
        })
    };
}