const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const getSecret = () => {
    const s = process.env.JWT_SECRET;
    if (!s || !String(s).trim()) {
        throw new Error('JWT_SECRET is required for wallet bind challenges');
    }
    return String(s).trim();
};

const CHALLENGE_TTL_SEC = 5 * 60;

const normalizeAddress = (address) => String(address || '').trim().toLowerCase();
const normalizeStudentId = (studentId) => String(studentId || '').trim();

const buildChallengeMessage = ({ studentId, address, nonce, issuedAt, expiresAt }) => [
    'E-Voting DID Wallet Binding',
    '',
    'Tandatangani pesan ini untuk membuktikan bahwa Anda memiliki wallet yang akan ditautkan ke akun mahasiswa.',
    `Student ID: ${studentId}`,
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expires At: ${expiresAt}`,
].join('\n');

function createWalletBindChallenge({ studentId, address }) {
    const normalizedStudentId = normalizeStudentId(studentId);
    const normalizedAddress = normalizeAddress(address);
    const nonce = crypto.randomBytes(16).toString('hex');
    const issuedAtMs = Date.now();
    const expiresAtMs = issuedAtMs + CHALLENGE_TTL_SEC * 1000;
    const issuedAt = new Date(issuedAtMs).toISOString();
    const expiresAt = new Date(expiresAtMs).toISOString();

    const token = jwt.sign(
        {
            purpose: 'wallet_bind',
            studentId: normalizedStudentId,
            address: normalizedAddress,
            nonce,
            issuedAt,
            expiresAt,
        },
        getSecret(),
        {
            algorithm: 'HS256',
            expiresIn: CHALLENGE_TTL_SEC,
        }
    );

    return {
        challengeToken: token,
        message: buildChallengeMessage({
            studentId: normalizedStudentId,
            address: normalizedAddress,
            nonce,
            issuedAt,
            expiresAt,
        }),
        expiresAt,
    };
}

function verifyWalletBindChallenge(challengeToken) {
    const decoded = jwt.verify(challengeToken, getSecret(), {
        algorithms: ['HS256'],
    });

    if (decoded.purpose !== 'wallet_bind') {
        throw new Error('Invalid wallet bind challenge purpose');
    }

    const studentId = normalizeStudentId(decoded.studentId);
    const address = normalizeAddress(decoded.address);
    const nonce = String(decoded.nonce || '').trim();
    const issuedAt = String(decoded.issuedAt || '').trim();
    const expiresAt = String(decoded.expiresAt || '').trim();

    if (!studentId || !address || !nonce || !issuedAt || !expiresAt) {
        throw new Error('Wallet bind challenge is incomplete');
    }

    return {
        studentId,
        address,
        nonce,
        issuedAt,
        expiresAt,
        message: buildChallengeMessage({
            studentId,
            address,
            nonce,
            issuedAt,
            expiresAt,
        }),
    };
}

module.exports = {
    createWalletBindChallenge,
    verifyWalletBindChallenge,
    buildChallengeMessage,
    CHALLENGE_TTL_SEC,
};
