const mongoose = require('mongoose');

const VoteSchema = new mongoose.Schema({
    did: {
        type: String,
        required: true
    },
    candidateId: {
        type: Number,
        required: true
    },
    transactionHash: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Vote', VoteSchema);
