const http = require('http');

const payload = JSON.stringify({
  name: 'Rohit Sharma',
  email: 'rohit.aiml24@vemanait.edu.in',
  role: 'student',
  department: 'AI & Machine Learning (AIML)',
  tempPassword: 'Vemana@2025',
  portalUrl: 'http://localhost:8080/'
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/mail/send-credentials',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => console.error('Error:', e));
req.write(payload);
req.end();
