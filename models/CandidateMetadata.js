const mongoose = require('mongoose');

const CandidateMetadataSchema = new mongoose.Schema({
    sessionId: {
        type: Number,
        required: true,
        index: true,
    },
    candidateId: {
        type: Number,
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    photoUrl: {
        type: String,
        default: '',
        trim: true,
    },
    vision: {
        type: String,
        default: '',
        trim: true,
    },
    mission: {
        type: String,
        default: '',
        trim: true,
    },
}, {
    timestamps: true,
});

CandidateMetadataSchema.index({ sessionId: 1, candidateId: 1 }, { unique: true });

module.exports = mongoose.model('CandidateMetadata', CandidateMetadataSchema);
