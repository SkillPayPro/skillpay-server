const https = require('https');
const http = require('http');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';

function callAnthropic(model, system, prompt, maxTokens) {
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
        'x-api-key': API_KEY,
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
            reject(new Error('Anthropic ' + res.statusCode + ': ' + (parsed.error?.message || data.substring(0, 200))));
            return;
          }
          resolve(parsed.content?.[0]?.text || '');
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check — Railway pings dit
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', hasKey: !!API_KEY, version: '3' }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/generate') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  if (!API_KEY) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY niet ingesteld op Railway' }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const b = JSON.parse(body);
      const type = b.type || 'text';
      const prompt = (b.prompt || '').substring(0, 60000);
      const system = b.system || 'You are a helpful assistant.';

      let model, maxTokens;
      if (type === 'website') {
        model = 'claude-sonnet-4-6';
        maxTokens = 16000;
      } else {
        model = 'claude-sonnet-4-6';
        maxTokens = 8000;
      }

      console.log('[' + new Date().toISOString() + '] type=' + type + ' model=' + model + ' tokens=' + maxTokens);

      let text = await callAnthropic(model, system, prompt, maxTokens);
      
      // Post-process website HTML
      if (type === 'website') {
        // 1. Fix opacity:0 buiten keyframes
        if (text.includes('<style')) {
          text = text.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, function(match, css) {
            var kf = [];
            var safe = css.replace(/@(?:-webkit-|-moz-|-o-)?keyframes[\s\S]*?\{[\s\S]*?\}\s*\}/g, function(k) {
              kf.push(k); return '/*KF' + (kf.length-1) + '*/';
            });
            safe = safe.replace(/opacity\s*:\s*0/g, 'opacity:1');
            safe = safe.replace(/visibility\s*:\s*hidden/g, 'visibility:visible');
            safe = safe.replace(/\/\*KF(\d+)\*\//g, function(_, i) { return kf[parseInt(i)]; });
            return match.replace(css, safe);
          });
        }
        // 2. Fix JS opacity=0
        text = text.replace(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi, function(match, js) {
          var fixed = js
            .replace(/\.style\.opacity\s*=\s*['"]0['"]/g, '.style.opacity="1"')
            .replace(/\.style\.visibility\s*=\s*['"]hidden['"]/g, '.style.visibility="visible"');
          return match.replace(js, fixed);
        });
        // 3. Preloader altijd na max 2 seconden verwijderen
        var preloaderFix = '<script id="_sp_preload_fix">(function(){' +
          'function killPreloader(){' +
          'var sels=["#preloader","#loader","#loading","#splash",".preloader",".loader",".loading",".splash",".intro-screen","#intro"];' +
          'sels.forEach(function(s){var el=document.querySelector(s);if(el)el.style.cssText="display:none!important";});' +
          '}' +
          'setTimeout(killPreloader,2000);' +
          'document.addEventListener("DOMContentLoaded",function(){setTimeout(killPreloader,500);});' +
          '})();<\/script>';
        text = text.replace('</body>', preloaderFix + '</body>');
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text }));
    } catch(e) {
      console.error('Error:', e.message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('SkillPay AI Server running on port ' + PORT + ' | API key: ' + (API_KEY ? 'SET' : 'MISSING'));
});

// Dit wordt niet gebruikt — de fix zit in de functie hieronder
