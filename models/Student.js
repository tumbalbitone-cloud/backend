const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
    username: {
        type: String,
        trim: true,
        unique: true,
        sparse: true
    },
    studentId: {
        type: String,
        trim: true,
        unique: true,
        sparse: true
    },
    name: {
        type: String,
        trim: true,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
        index: true
    },
    active: {
        type: Boolean,
        default: true
    },
    claimedBy: {
        type: String, // Stores the Ethereum address of the user who claimed this ID
        default: null
    },
    claimedByNormalized: {
        type: String,
        default: undefined,
        index: {
            unique: true,
            sparse: true
        }
    },
    nftTxHash: {
        type: String, // Stores the transaction hash when the NFT was minted
        default: null
    },
    nftMintInProgress: {
        type: Boolean,
        default: false
    }
});

StudentSchema.pre('validate', function enforceRoleIdentity() {
    if (this.role === 'admin') {
        if (!this.username) {
            this.invalidate('username', 'Username is required for admin users');
        }
        return;
    }

    if (!this.studentId) {
        this.invalidate('studentId', 'Student ID is required for student users');
    }
});

module.exports = mongoose.model('Student', StudentSchema);
