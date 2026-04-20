const express = require('express');
const { body, validationResult } = require('express-validator');
const CandidateMetadata = require('../models/CandidateMetadata');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const { adminLimiter } = require('../middleware/rateLimiter');
const { invalidateReadModel } = require('../utils/blockchainReadModel');

const router = express.Router();

router.post('/metadata', adminLimiter, authMiddleware, adminMiddleware, [
    body('sessionId')
        .isInt({ min: 1 })
        .withMessage('sessionId must be a positive integer'),
    body('candidateId')
        .isInt({ min: 1 })
        .withMessage('candidateId must be a positive integer'),
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Candidate name is required')
        .isLength({ min: 1, max: 120 })
        .withMessage('Candidate name must be 1-120 characters'),
    body('photoUrl')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 2048 })
        .withMessage('photoUrl must be at most 2048 characters'),
    body('vision')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 5000 })
        .withMessage('vision must be at most 5000 characters'),
    body('mission')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 5000 })
        .withMessage('mission must be at most 5000 characters'),
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
            });
        }

        const sessionId = Number(req.body.sessionId);
        const candidateId = Number(req.body.candidateId);
        const name = String(req.body.name || '').trim();
        const photoUrl = String(req.body.photoUrl || '').trim();
        const vision = String(req.body.vision || '').trim();
        const mission = String(req.body.mission || '').trim();

        const metadata = await CandidateMetadata.findOneAndUpdate(
            { sessionId, candidateId },
            { $set: { sessionId, candidateId, name, photoUrl, vision, mission } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        invalidateReadModel({ sessionId });

        res.json({
            success: true,
            metadata: {
                sessionId: metadata.sessionId,
                candidateId: metadata.candidateId,
                name: metadata.name,
                photoUrl: metadata.photoUrl,
                vision: metadata.vision,
                mission: metadata.mission,
            },
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
