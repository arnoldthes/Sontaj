import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { user_id } = req.body;
        const key = `online:${user_id}`;
        await kv.setex(key, 60, 'active');
        const keys = await kv.keys('online:*');
        const count = keys.length;
        await kv.set('online:count', count);
        return res.status(200).json({ online: count });
    }
    return res.status(405).json({ error: 'Method not allowed' });
}
