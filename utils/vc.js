/**
 * Verifiable Credential (VC) Utility Functions
 * Implements W3C Verifiable Credentials standard
 */

const { createJWT, verifyJWT, ES256KSigner } = require('did-jwt');
const { ethers } = require('ethers');

// Load issuer private key from environment
// In production, this should be stored securely
const ISSUER_PRIVATE_KEY = process.env.VC_ISSUER_PRIVATE_KEY || 
    '0x0000000000000000000000000000000000000000000000000000000000000001'; // Default for development

/**
 * Create a Verifiable Credential (VC) according to W3C standard
 * @param {Object} credentialSubject - The subject of the credential
 * @param {String} issuerDid - The DID of the issuer
 * @returns {Object} Verifiable Credential object
 */
const createVerifiableCredential = (credentialSubject, issuerDid = 'did:web:university.edu') => {
    const now = new Date();
    const issuanceDate = now.toISOString();

    const vc = {
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://www.w3.org/2018/credentials/examples/v1"
        ],
        "type": ["VerifiableCredential", "StudentCredential"],
        "issuer": {
            id: issuerDid,
            name: "University E-Voting System"
        },
        "issuanceDate": issuanceDate,
        "credentialSubject": {
            ...credentialSubject
        },
        "credentialSchema": {
            id: "https://university.edu/schemas/student-credential/v1",
            type: "JsonSchemaValidator2018"
        }
    };

    return vc;
};

/**
 * Convert hex private key to bytes array
 * @param {String} hexKey - Hex string with or without 0x prefix
 * @returns {Uint8Array} 32-byte array
 */
const hexToBytes = (hexKey) => {
    // Remove 0x prefix if present
    const cleanHex = hexKey.startsWith('0x') ? hexKey.slice(2) : hexKey;
    
    // Validate length (should be 64 hex chars = 32 bytes)
    if (cleanHex.length !== 64) {
        throw new Error(`Invalid private key length. Expected 64 hex characters (32 bytes), got ${cleanHex.length}`);
    }
    
    // Convert hex string to bytes
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
    }
    
    return bytes;
};

/**
 * Sign a Verifiable Credential using did-jwt
 * @param {Object} vc - Verifiable Credential object
 * @param {String} issuerDid - The DID of the issuer
 * @returns {Promise<String>} JWT string containing the signed VC
 */
const signVerifiableCredential = async (vc, issuerDid = 'did:web:university.edu') => {
    try {
        // Convert hex private key to bytes array
        const privateKeyBytes = hexToBytes(ISSUER_PRIVATE_KEY);
        
        // Create signer from private key bytes
        const signer = ES256KSigner(privateKeyBytes);

        // Create JWT payload
        const payload = {
            sub: vc.credentialSubject.id,
            vc: vc,
            iss: issuerDid,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year expiration
        };

        // Sign and create JWT
        const jwt = await createJWT(
            payload,
            {
                issuer: issuerDid,
                signer: signer
            },
            {
                alg: 'ES256K',
                typ: 'JWT'
            }
        );

        return jwt;
    } catch (error) {
        throw new Error(`Failed to sign VC: ${error.message}`);
    }
};

/**
 * Get public key from private key (for ES256K)
 * @param {Uint8Array} privateKeyBytes - Private key as bytes
 * @returns {Object} Public key in JWK format
 */
const getPublicKeyFromPrivate = (privateKeyBytes) => {
    // For ES256K, we need to derive public key from private key
    // Using ethers.js to create wallet and get public key
    const privateKeyHex = '0x' + Array.from(privateKeyBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    
    try {
        const wallet = new ethers.Wallet(privateKeyHex);
        const publicKey =
            wallet?.signingKey?.publicKey ||
            (ethers.SigningKey && ethers.SigningKey.computePublicKey
                ? ethers.SigningKey.computePublicKey(privateKeyHex, false)
                : null);
        if (!publicKey) {
            throw new Error('Unable to derive public key from issuer private key');
        }
        
        // Convert to JWK format (simplified for ES256K)
        // For did-jwt, we need the public key in a specific format
        return {
            id: `${process.env.VC_ISSUER_DID || 'did:web:university.edu'}#keys-1`,
            type: 'EcdsaSecp256k1VerificationKey2019',
            controller: process.env.VC_ISSUER_DID || 'did:web:university.edu',
            publicKeyHex: publicKey.slice(2), // Remove 0x prefix
            publicKeyBase58: null // Not needed for ES256K
        };
    } catch (error) {
        throw new Error(`Failed to derive public key: ${error.message}`);
    }
};

/**
 * Verify a Verifiable Credential JWT
 * @param {String} jwt - JWT string containing the VC
 * @returns {Promise<Object>} Verified VC payload
 */
const verifyVerifiableCredential = async (jwt) => {
    try {
        const parts = jwt.split('.');
        if (parts.length !== 3) {
            return {
                valid: false,
                error: 'Invalid JWT format'
            };
        }

        const expectedIssuerDid = process.env.VC_ISSUER_DID || 'did:web:university.edu';
        const privateKeyBytes = hexToBytes(ISSUER_PRIVATE_KEY);
        const publicKey = getPublicKeyFromPrivate(privateKeyBytes);

        const verified = await verifyJWT(jwt, {
            resolver: {
                resolve: async (did) => {
                    if (did !== expectedIssuerDid) {
                        throw new Error(`DID ${did} not found`);
                    }

                    return {
                        didDocument: {
                            id: did,
                            verificationMethod: [{
                                id: `${did}#keys-1`,
                                type: 'EcdsaSecp256k1VerificationKey2019',
                                controller: did,
                                publicKeyHex: publicKey.publicKeyHex
                            }],
                            authentication: [`${did}#keys-1`],
                            assertionMethod: [`${did}#keys-1`]
                        }
                    };
                }
            }
        });

        const payload = verified?.payload;
        const vc = payload?.vc;
        if (!vc) {
            return {
                valid: false,
                error: 'VC not found in JWT payload'
            };
        }

        if (!vc['@context'] || !vc.type || !vc.credentialSubject) {
            return {
                valid: false,
                error: 'Invalid VC structure'
            };
        }

        const issuerDid = vc.issuer?.id || vc.issuer;
        if (issuerDid !== expectedIssuerDid) {
            return {
                valid: false,
                error: `VC issuer ${issuerDid} does not match expected issuer ${expectedIssuerDid}`
            };
        }

        return {
            valid: true,
            payload,
            vc
        };
    } catch (error) {
        return {
            valid: false,
            error: error.message
        };
    }
};

/**
 * Extract VC from JWT without verification (for display purposes)
 * @param {String} jwt - JWT string
 * @returns {Object} VC object
 */
const extractVCFromJWT = (jwt) => {
    try {
        const parts = jwt.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid JWT format');
        }

        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        return payload.vc;
    } catch (error) {
        throw new Error(`Failed to extract VC: ${error.message}`);
    }
};

/**
 * Validate wallet address format
 * @param {String} address - Ethereum address
 * @returns {Boolean} True if valid
 */
const isValidAddress = (address) => {
    try {
        return ethers.isAddress(address);
    } catch {
        return false;
    }
};

/**
 * Create DID from Ethereum address
 * @param {String} address - Ethereum address
 * @returns {String} DID string
 */
const createDidFromAddress = (address) => {
    if (!isValidAddress(address)) {
        throw new Error('Invalid Ethereum address');
    }
    return `did:ethr:${address.toLowerCase()}`;
};

module.exports = {
    createVerifiableCredential,
    signVerifiableCredential,
    verifyVerifiableCredential,
    extractVCFromJWT,
    isValidAddress,
    createDidFromAddress
};
