import ontraportCheck from './ontraport.js';
import stripeAuthCheck from './stripe-auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { cc, user_id, gate } = req.body;

    try {
        let result;

        switch (gate) {
            case 'ontraport':
                result = await ontraportCheck(cc);
                break;
            case 'stripe_auth_free':
                result = await stripeAuthCheck(cc);
                break;
            default:
                return res.status(400).json({
                    status: 'declined',
                    message: 'unknown gate'
                });
        }

        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({
            status: 'declined',
            message: `error: ${error.message}`
        });
    }
}
