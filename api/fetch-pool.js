export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { poolName, poolAddress, protocol, chain } = req.body;
  if (!poolName) return res.status(400).json({ error: 'Missing poolName' });

  const prompt = `Search the web right now for live DeFi data for this specific pool.

Pool: "${poolName}"
Contract address: ${poolAddress}
Protocol: ${protocol}
Chain: ${chain}

Find:
1. Current TVL (total value locked) in USD
2. 24-hour trading volume in USD  
3. 24-hour fees collected in USD

Also find:
4. Combined TVL of ALL 6 active TELx pools in USD
5. Current TEL token price in USD (check coingecko.com or dexscreener.com)
Note: weekly TEL rewards are hardcoded per-pool from telx.network — do NOT include weeklyTEL in the response.

Search dexscreener.com using the contract address ${poolAddress}, also try defillama.com and coingecko.com.

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "tvl": <number or null>,
  "vol24h": <number or null>,
  "fees24h": <number or null>,
  "totalAllPoolsTVL": <number or null>,
  "telPrice": <number or null>,
  "fetchedAt": "<date string>",
  "sources": "<sources used>"
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
      const err = await response.text();
      return res.status(500).json({ error: 'Anthropic API error', detail: err });
    }

    const data = await response.json();
    const text = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const jsonMatch = text.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Could not parse response', raw: text });

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
