const mongoose = require('mongoose');

// TTL index is useful for expiring challenges automatically
const ChallengeSchema = new mongoose.Schema({
    did: {
        type: String,
        required: true,
        unique: true
    },
    challenge: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 300 // Expires in 5 minutes
    }
});

module.exports = mongoose.model('Challenge', ChallengeSchema);
