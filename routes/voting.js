const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Vote = require('../models/Vote');
const { authMiddleware } = require('../middleware/authMiddleware');
const { votingLimiter } = require('../middleware/rateLimiter');
const { AppError } = require('../middleware/errorHandler');
const { isValidAddress } = require('../utils/vc');

/**
 * @route   POST /api/voting/record
 * @desc    Record vote in database (off-chain metadata)
 * @access  Private (User)
 */
router.post('/record', votingLimiter, authMiddleware, [
    body('did')
        .notEmpty()
        .withMessage('DID is required')
        .matches(/^did:/)
        .withMessage('Invalid DID format'),
    body('candidateId')
        .notEmpty()
        .withMessage('Candidate ID is required')
        .isInt({ min: 1 })
        .withMessage('Candidate ID must be a positive integer'),
    body('transactionHash')
        .notEmpty()
        .withMessage('Transaction hash is required')
        .matches(/^0x[a-fA-F0-9]{64}$/)
        .withMessage('Invalid transaction hash format')
], async (req, res, next) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { did, candidateId, transactionHash } = req.body;

        // Check if vote already recorded for this transaction
        const existingVote = await Vote.findOne({ transactionHash });
        if (existingVote) {
            throw new AppError('Vote already recorded for this transaction', 400);
        }

        // Record vote in MongoDB
        await Vote.create({
            did,
            candidateId,
            transactionHash,
            voterId: req.user.id || req.user.studentId,
            timestamp: new Date()
        });

        console.log(`Recorded vote for ${did} -> Candidate ${candidateId} (Tx: ${transactionHash})`);
        
        res.json({
            success: true,
            message: 'Vote recorded successfully'
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
