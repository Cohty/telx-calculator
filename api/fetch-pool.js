export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Log every step so Vercel shows us exactly where it fails
  console.log('=== fetch-pool called ===');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log('API key present:', !!apiKey);
  console.log('API key length:', apiKey ? apiKey.length : 0);
  console.log('API key starts with sk-ant:', apiKey ? apiKey.startsWith('sk-ant') : false);

  if (!apiKey) {
    console.log('ERROR: No API key found in environment');
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel environment variables' });
  }

  const { poolName, poolAddress, protocol, chain } = req.body;
  console.log('Pool name:', poolName);

  if (!poolName) return res.status(400).json({ error: 'Missing poolName' });

  const prompt = `Search the web for live DeFi data for this pool: "${poolName}" at address ${poolAddress} on ${protocol} / ${chain}. Find TVL, 24h volume, 24h fees, total TELx all-pool TVL, and TEL price in USD. Return ONLY JSON: {"tvl":0,"vol24h":0,"fees24h":0,"totalAllPoolsTVL":0,"telPrice":0,"fetchedAt":"today","sources":""}`;

  try {
    console.log('Calling Anthropic API...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    console.log('Anthropic response status:', response.status);

    const data = await response.json();
    console.log('Anthropic response type:', data.type);

    if (!response.ok) {
      console.log('Anthropic error:', JSON.stringify(data));
      return res.status(500).json({
        error: `Anthropic API error ${response.status}`,
        detail: data.error?.message || JSON.stringify(data)
      });
    }

    const text = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    console.log('Got text response, length:', text.length);

    const match = text.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
    if (!match) {
      console.log('No JSON found in response');
      return res.status(500).json({ error: 'No JSON in response', raw: text.slice(0, 300) });
    }

    const parsed = JSON.parse(match[0]);
    console.log('Success! Returning data');
    return res.status(200).json(parsed);

  } catch (err) {
    console.log('CAUGHT ERROR:', err.message);
    console.log('Error stack:', err.stack);
    return res.status(500).json({ error: err.message });
  }
}
