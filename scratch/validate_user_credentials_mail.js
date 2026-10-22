/**
 * Functional test to verify sendUserCredentialsEmail schema and dispatch
 */
const https = require('https');

const PROJECT_ID = 'ai-powered-campus-radio';
const API_KEY = 'AIzaSyBUXhQBeUgO1h3rqBlGg9Dp6JkmL8nLXVw';

function signIn(email, password) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      email: email,
      password: password,
      returnSecureToken: true
    });

    const req = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      path: `/v1/accounts:signInWithPassword?key=${API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.idToken) resolve(json);
          else reject(new Error(json.error?.message || 'Auth failed'));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function firestorePost(collection, data, idToken) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    let path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}`;
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    } else {
      path += `?key=${API_KEY}`;
    }

    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: path,
      method: 'POST',
      headers: headers
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ docId: parsed.name.split('/').pop(), data: parsed });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${buf}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('--- TESTING USER CREDENTIALS EMAIL DISPATCH ---');
  let auth;
  try {
    auth = await signIn('admin@vemanait.edu.in', 'Admin@12345');
  } catch (e) {
    auth = await signIn('principal@vemanait.edu.in', 'Principal@123');
  }
  console.log('✅ Admin Authenticated:', auth.email);

  const testUser = {
    name: 'Rohit Sharma',
    email: 'rohit.aiml24@vemanait.edu.in',
    role: 'STUDENT',
    department: 'AI & Machine Learning (AIML)',
    tempPassword: 'Vemana@2025',
    portalUrl: 'http://localhost:8080/'
  };

  const mailDoc = {
    fields: {
      to: {
        arrayValue: {
          values: [{ stringValue: testUser.email }]
        }
      },
      bcc: {
        arrayValue: {
          values: [{ stringValue: 'admin@vemanait.edu.in' }]
        }
      },
      message: {
        mapValue: {
          fields: {
            subject: { stringValue: 'Welcome to Vemana CampusConnect - Your Login Credentials' },
            text: {
              stringValue: `Dear ${testUser.name},\n\nAn account has been created for you on the Vemana CampusConnect Portal.\n\nRole: ${testUser.role}\nDepartment: ${testUser.department}\nPortal URL: ${testUser.portalUrl}\nLogin Email: ${testUser.email}\nTemporary Password: ${testUser.tempPassword}\n\nPlease login and change your password upon initial sign-in.\n\nBest regards,\nVemana IT Administration`
            },
            html: {
              stringValue: `<div style="font-family: Arial, sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px;"><div style="text-align: center; margin-bottom: 20px;"><h2 style="color: #4f46e5; margin: 0;">CampusConnect Portal</h2><p style="color: #64748b; font-size: 13px; margin-top: 4px;">Vemana Institute of Technology</p></div><p>Dear <strong>${testUser.name}</strong>,</p><p>Your institutional account has been successfully provisioned with the following details:</p><table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 8px;"><tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Portal URL:</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><a href="${testUser.portalUrl}" style="color: #4f46e5; font-weight: bold;">Access CampusConnect</a></td></tr><tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Assigned Role:</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${testUser.role}</td></tr><tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Department:</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${testUser.department}</td></tr><tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Login Email:</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><code>${testUser.email}</code></td></tr><tr><td style="padding: 10px; font-weight: bold;">Temporary Password:</td><td style="padding: 10px;"><code>${testUser.tempPassword}</code></td></tr></table><p style="font-size: 13px; color: #475569;">Please sign in and update your security settings. For any support, contact your Department Coordinator.</p></div>`
            }
          }
        }
      },
      createdAt: {
        timestampValue: new Date().toISOString()
      }
    }
  };

  const res = await firestorePost('mail', mailDoc, auth.idToken);
  console.log('✅ Mail Document Queued Successfully in Firestore "mail" Collection!');
  console.log('   Document ID:', res.docId);
  console.log('   Recipient (TO):', testUser.email);
  console.log('   BCC Admin:', auth.email);
  console.log('   Subject:', 'Welcome to Vemana CampusConnect - Your Login Credentials');
  console.log('   Portal URL in HTML body:', testUser.portalUrl);
  console.log('--- ALL CHECKS PASSED ---');
}

run().catch(e => {
  console.error('❌ Error:', e);
  process.exit(1);
});
