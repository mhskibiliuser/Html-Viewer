const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const HOST = '0.0.0.0';
const DOCROOT = __dirname;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // Default to index.html for root
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Remove leading slash for file lookup
  const filePath = path.join(DOCROOT, pathname);

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);

  // Security check: prevent directory traversal
  const realPath = path.resolve(filePath);
  if (!realPath.startsWith(DOCROOT)) {
    console.log(`[${new Date().toISOString()}] DENIED: Directory traversal attempt`);
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  // Check if file exists
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      console.log(`[${new Date().toISOString()}] File not found: ${filePath}`);
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>404 - File Not Found</h1><p>Path: ' + pathname + '</p></body></html>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] Stream error:`, err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Server Error');
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║  HTTP Server Started                       ║`);
  console.log(`╠════════════════════════════════════════════╣`);
  console.log(`║  Host: ${HOST.padEnd(37)}║`);
  console.log(`║  Port: ${PORT.toString().padEnd(37)}║`);
  console.log(`║  Root: ${DOCROOT.padEnd(37)}║`);
  console.log(`╚════════════════════════════════════════════╝\n`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
