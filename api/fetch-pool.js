export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Check API key first
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not set. Go to Vercel → Settings → Environment Variables and add it, then redeploy.'
    });
  }

  const { poolName, poolAddress, protocol, chain } = req.body;
  if (!poolName) return res.status(400).json({ error: 'Missing poolName' });

  const prompt = `Search the web right now for live DeFi data for this liquidity pool.

Pool: "${poolName}"
Contract address: ${poolAddress}
Protocol: ${protocol}
Chain: ${chain}

Search dexscreener.com, defillama.com, and coingecko.com for:
1. Current TVL in USD for this pool
2. 24-hour trading volume in USD
3. 24-hour fees in USD
4. Combined TVL of all 6 active TELx pools in USD
5. Current TEL token price in USD

Return ONLY this JSON with no markdown or extra text:
{"tvl":123456,"vol24h":1234,"fees24h":12,"totalAllPoolsTVL":2000000,"telPrice":0.004,"fetchedAt":"2026-03-27","sources":"dexscreener"}`;

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

    // If Anthropic returned an error, surface the full details
    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({
        error: `Anthropic API returned HTTP ${response.status}`,
        detail: errText
      });
    }

    const data = await response.json();

    // The response may contain tool_use blocks (web search) followed by a text block
    const textBlocks = data.content.filter(b => b.type === 'text').map(b => b.text);
    const fullText = textBlocks.join('');

    // Find JSON in the response
    const cleaned = fullText.replace(/```json|```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      // Return what we got so the frontend can show something useful
      return res.status(500).json({
        error: 'No JSON found in Claude response',
        raw: fullText.slice(0, 300)
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({
      error: err.message,
      stack: err.stack ? err.stack.slice(0, 200) : undefined
    });
  }
}
