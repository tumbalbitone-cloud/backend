/**
 * Simple test script to verify server is running and CORS is configured correctly
 */

const http = require('http');

const testServer = () => {
    const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/',
        method: 'GET',
        headers: {
            'Origin': 'http://localhost:3000'
        }
    };

    const req = http.request(options, (res) => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Headers:`, res.headers);

        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            console.log('Response:', data);
            if (res.statusCode === 200) {
                console.log('✅ Server is running correctly!');
            } else {
                console.log('❌ Server returned error status');
            }
        });
    });

    req.on('error', (e) => {
        console.error(`❌ Problem with request: ${e.message}`);
        console.error('Make sure the server is running on port 3001');
    });

    req.end();
};

// Test CORS preflight
const testCORS = () => {
    const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/did/status/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        method: 'OPTIONS',
        headers: {
            'Origin': 'http://localhost:3000',
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'Content-Type, Authorization'
        }
    };

    const req = http.request(options, (res) => {
        console.log('\n=== CORS Preflight Test ===');
        console.log(`Status: ${res.statusCode}`);
        console.log(`CORS Headers:`);
        console.log(`  Access-Control-Allow-Origin: ${res.headers['access-control-allow-origin']}`);
        console.log(`  Access-Control-Allow-Methods: ${res.headers['access-control-allow-methods']}`);
        console.log(`  Access-Control-Allow-Headers: ${res.headers['access-control-allow-headers']}`);
        
        if (res.statusCode === 204 || res.statusCode === 200) {
            console.log('✅ CORS preflight successful!');
        } else {
            console.log('❌ CORS preflight failed');
        }
    });

    req.on('error', (e) => {
        console.error(`❌ CORS preflight error: ${e.message}`);
    });

    req.end();
};

console.log('Testing server connection...');
testServer();

setTimeout(() => {
    testCORS();
}, 500);
