const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const { createVerifiableCredential, signVerifiableCredential, createDidFromAddress } = require('./utils/vc.js');

async function testProduction() {
    try {
        const studentId = '12345';
        const userAddress = ethers.Wallet.createRandom().address;
        
        console.log("Mocking student login...");
        const authToken = jwt.sign(
            { id: 'dummy_id', username: 'dummy', role: 'user', studentId },
            process.env.JWT_SECRET || 'NzDkf109sDNRpRctNzHM6CoytZCLh5KsvilM7HqY9oU',
            { expiresIn: '1h' }
        );

        console.log("Mocking VC...");
        const credentialSubject = {
            id: createDidFromAddress(userAddress),
            studentId,
            name: "John Doe",
            status: "active"
        };
        const vc = createVerifiableCredential(credentialSubject);
        const vcJwt = await signVerifiableCredential(vc);

        console.log("Sending POST to production...");
        const start = Date.now();
        const response = await fetch('https://backend-production-103c.up.railway.app/api/did/verify-and-register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                'Origin': 'https://frontend-production-a2c6.up.railway.app'
            },
            body: JSON.stringify({ userAddress, vcJwt })
        });
        
        console.log(`Response Time: ${Date.now() - start}ms`);
        console.log(`Status: ${response.status} ${response.statusText}`);
        
        const text = await response.text();
        console.log(`Body: ${text}`);
    } catch (err) {
        console.error("Test failed:", err);
    }
}

testProduction();
