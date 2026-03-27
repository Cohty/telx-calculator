export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { poolName, poolAddress, protocol, chain } = req.body;
  if (!poolName) return res.status(400).json({ error: 'Missing poolName' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY environment variable is not set in Vercel' });
  }

  const prompt = `Search the web right now for live DeFi data for this specific liquidity pool.

Pool: "${poolName}"
Contract address: ${poolAddress}
Protocol: ${protocol}
Chain: ${chain}

Search for this pool on dexscreener.com using the contract address, then also check defillama.com and coingecko.com.

Find and return:
1. Current TVL (total value locked) in USD for THIS pool
2. 24-hour trading volume in USD for THIS pool
3. 24-hour fees collected in USD for THIS pool
4. Combined TVL of ALL 6 active TELx pools added together in USD
5. Current TEL token price in USD

Respond with ONLY this JSON — no markdown, no explanation, nothing else:
{
  "tvl": <number or null>,
  "vol24h": <number or null>,
  "fees24h": <number or null>,
  "totalAllPoolsTVL": <number or null>,
  "telPrice": <number or null>,
  "fetchedAt": "<today's date and time>",
  "sources": "<comma separated list of sources checked>"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: `Anthropic API returned ${response.status}`, detail: errText });
    }

    const data = await response.json();

    // Extract text blocks — response may also contain tool_use blocks from web search
    const text = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Find the JSON object in the response
    const jsonMatch = text.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'No JSON found in response', raw: text.slice(0, 500) });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
