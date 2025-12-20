const http = require('http');
const https = require('https');
const { URL } = require('url');

const defaultTarget = process.env.RPC_TARGET || 'https://mainnet.base.org';
const port = Number(process.env.RPC_PROXY_PORT || 8787);

const sendCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-RPC-Target');
};

const server = http.createServer((req, res) => {
  sendCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });

  req.on('end', () => {
    const headerTarget = req.headers['x-rpc-target'];
    const resolvedTarget =
      typeof headerTarget === 'string' && headerTarget.trim().length > 0
        ? headerTarget.trim()
        : defaultTarget;
    let targetUrl;
    try {
      targetUrl = new URL(resolvedTarget);
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid RPC target URL');
      return;
    }

    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Unsupported RPC protocol');
      return;
    }
    const client = targetUrl.protocol === 'https:' ? https : http;

    const proxyReq = client.request(
      {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (error) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Proxy error: ${error.message}`);
    });

    proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(port, () => {
  console.log(`RPC proxy listening on http://localhost:${port}`);
  console.log(`Forwarding to ${defaultTarget}`);
});
