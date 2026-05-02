const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * RefreshToken — stores a SHA-256 hash of each active refresh token.
 * TTL index (expiresAt) automatically removes expired records.
 *
 * We never store the raw token — only its hash — so a DB leak
 * cannot be used to impersonate users.
 */
const RefreshTokenSchema = new mongoose.Schema({
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true,
        index: true,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 }, // MongoDB TTL — auto-delete
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

/** Hash a raw JWT refresh token with SHA-256 */
RefreshTokenSchema.statics.hashToken = function (rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
};

/**
 * Save a new refresh token record.
 * @param {string} userId
 * @param {string} rawToken - The raw JWT string
 * @param {number} expiresInMs - Milliseconds until expiry
 */
RefreshTokenSchema.statics.createRecord = async function (userId, rawToken, expiresInMs) {
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + expiresInMs);
    await this.create({ tokenHash, userId, expiresAt });
};

/**
 * Verify that the raw token exists in the DB.
 * Returns the record or null.
 */
RefreshTokenSchema.statics.findByRawToken = async function (rawToken) {
    const tokenHash = this.hashToken(rawToken);
    return this.findOne({ tokenHash });
};

/**
 * Delete a single refresh token record (used on rotation / logout).
 */
RefreshTokenSchema.statics.deleteByRawToken = async function (rawToken) {
    const tokenHash = this.hashToken(rawToken);
    return this.deleteOne({ tokenHash });
};

/**
 * Delete ALL refresh tokens for a user (logout from all devices).
 */
RefreshTokenSchema.statics.deleteAllForUser = async function (userId) {
    return this.deleteMany({ userId });
};

module.exports = mongoose.model('RefreshToken', RefreshTokenSchema);
