const https = require('https');
const http = require('http');

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

function callAnthropic(apiKey, model, system, prompt, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      system: system,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error('Anthropic ' + res.statusCode + ': ' + (parsed.error && parsed.error.message ? parsed.error.message : data)));
            return;
          }
          const text = parsed.content && parsed.content[0] && parsed.content[0].text ? parsed.content[0].text : '';
          resolve(text);
        } catch(e) {
          reject(new Error('Parse error: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/generate') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const b = JSON.parse(body);
      const apiKey = req.headers['x-api-key'] || '';
      if (!apiKey) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geen API key' }));
        return;
      }

      const type = b.type || 'text'; // 'text' of 'website'
      const prompt = (b.prompt || '').substring(0, 60000);
      const system = b.system || 'You are a helpful assistant.';
      
      let model, maxTokens;
      if (type === 'website') {
        model = 'claude-haiku-4-5-20251001';
        maxTokens = 8000;
      } else {
        // Fiverr/Malt: gebruik Sonnet voor kwaliteit
        model = 'claude-sonnet-4-6';
        maxTokens = 6000;
      }

      console.log('[' + new Date().toISOString() + '] type=' + type + ' model=' + model);

      const text = await callAnthropic(apiKey, model, system, prompt, maxTokens);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: text }));
    } catch(e) {
      console.error('Error:', e.message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log('SkillPay AI Server draait op poort ' + PORT);
});
