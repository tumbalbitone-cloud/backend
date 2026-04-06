const crypto = require('crypto');

/**
 * HMAC-signed query params for /uploads/:filename (uses JWT_SECRET).
 */
const getSecret = () => {
    const s = process.env.JWT_SECRET;
    if (!s || !String(s).trim()) {
        throw new Error('JWT_SECRET is required for upload URL signing');
    }
    return String(s).trim();
};

const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

function signUploadQuery(filename, ttlSec = DEFAULT_TTL_SEC) {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const sig = crypto
        .createHmac('sha256', getSecret())
        .update(`${filename}:${exp}`)
        .digest('base64url');
    return { exp, sig };
}

function verifyUploadQuery(filename, sig, exp) {
    if (!sig || exp === undefined || exp === null || exp === '') return false;
    const expNum = parseInt(String(exp), 10);
    if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) {
        return false;
    }
    const expected = crypto
        .createHmac('sha256', getSecret())
        .update(`${filename}:${expNum}`)
        .digest('base64url');
    try {
        const a = Buffer.from(String(sig), 'utf8');
        const b = Buffer.from(expected, 'utf8');
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

function appendSignedQuery(baseUrl, filename) {
    const { exp, sig } = signUploadQuery(filename);
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

module.exports = {
    signUploadQuery,
    verifyUploadQuery,
    appendSignedQuery,
    DEFAULT_TTL_SEC
};
