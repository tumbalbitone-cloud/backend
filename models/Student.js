const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
    studentId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    active: {
        type: Boolean,
        default: true
    },
    claimedBy: {
        type: String, // Stores the Ethereum address of the user who claimed this ID
        default: null
    }
});

module.exports = mongoose.model('Student', StudentSchema);
