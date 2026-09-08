const GEMINI_MODELS = [
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
    'gemini-3.6-flash'
];

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
};

export function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders
    });
}

export function GET() {
    return new Response(JSON.stringify({
        status: 'ok',
        models: GEMINI_MODELS,
        keyConfigured: Boolean(process.env.GEMINI_API_KEY)
    }), {
        status: 200,
        headers: corsHeaders
    });
}

export default async function handler(req, res) {
    if (req && typeof req.headers?.get === 'function') {
        if (req.method === 'OPTIONS') return OPTIONS();
        return GET();
    }

    if (res && typeof res.setHeader === 'function') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req && req.method === 'OPTIONS') {
            res.statusCode = 204;
            return res.end();
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify({
            status: 'ok',
            models: GEMINI_MODELS,
            keyConfigured: Boolean(process.env.GEMINI_API_KEY)
        }));
    }

    return GET();
}
