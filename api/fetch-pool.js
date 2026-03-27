export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY environment variable not found in Vercel' });
  }

  const { poolName, poolAddress, protocol, chain } = req.body;
  if (!poolName) return res.status(400).json({ error: 'Missing poolName' });

  const prompt = `Search the web for live DeFi data for this pool.

Pool: "${poolName}" | Address: ${poolAddress} | ${protocol} on ${chain}

Find: TVL in USD, 24h volume in USD, 24h fees in USD, combined TVL of all 6 active TELx pools, current TEL price in USD.

Check dexscreener.com and coingecko.com.

Respond with ONLY this JSON, no markdown:
{"tvl":0,"vol24h":0,"fees24h":0,"totalAllPoolsTVL":0,"telPrice":0,"fetchedAt":"today","sources":""}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: `Anthropic API error ${response.status}`,
        detail: data
      });
    }

    const text = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const match = text.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'No JSON in response', raw: text.slice(0, 400) });

    return res.status(200).json(JSON.parse(match[0]));

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
