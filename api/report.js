const https = require('https');

function githubRequest(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: path,
      method: method,
      headers: {
        'Authorization': 'token ' + token,
        'User-Agent': 'myob-vision-report',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    };
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = process.env.GITHUB_OWNER;
  const REPO = process.env.GITHUB_REPO;
  const FILE = 'report-data.json';
  const PATH = `/repos/${OWNER}/${REPO}/contents/${FILE}`;

  const empty = {
    version: 1, entries: [], limCards: [],
    meta: { name: '', period: '', focus: '' }
  };

  if (!TOKEN || !OWNER || !REPO) {
    return res.status(200).json(empty);
  }

  try {
    if (req.method === 'GET') {
      const result = await githubRequest('GET', PATH, TOKEN);
      if (result.status === 404) {
        return res.status(200).json(empty);
      }
      const file = JSON.parse(result.body);
      const content = Buffer.from(file.content, 'base64').toString('utf8');
      return res.status(200).send(content);
    }

    if (req.method === 'POST') {
      let body = '';
      await new Promise((resolve) => {
        req.on('data', chunk => body += chunk);
        req.on('end', resolve);
      });

      const encoded = Buffer.from(body).toString('base64');

      let sha = null;
      const existing = await githubRequest('GET', PATH, TOKEN);
      if (existing.status === 200) {
        sha = JSON.parse(existing.body).sha;
      }

      const payload = {
        message: 'Update vision mission report data',
        content: encoded
      };
      if (sha) payload.sha = sha;

      await githubRequest('PUT', PATH, TOKEN, payload);

      return res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
