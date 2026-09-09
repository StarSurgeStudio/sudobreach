const GEMINI_MODELS = [
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
    'gemini-3.6-flash'
];

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }

    const payload = {
        status: 'ok',
        models: GEMINI_MODELS,
        keyConfigured: Boolean(process.env.GEMINI_API_KEY)
    };

    if (typeof res.status === 'function' && typeof res.json === 'function') {
        return res.status(200).json(payload);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(payload));
}
