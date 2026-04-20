const express = require('express');
const { param, validationResult } = require('express-validator');
const {
    getSessionsReadModel,
    getSessionResultsReadModel,
    getSessionStatsReadModel,
    getSessionAllowlistReadModel,
} = require('../utils/blockchainReadModel');

const router = express.Router();

const sessionIdValidation = [
    param('sessionId')
        .isInt({ min: 1 })
        .withMessage('sessionId must be a positive integer'),
];

const getValidationErrors = (req) => {
    const errors = validationResult(req);
    return errors.isEmpty() ? null : errors.array();
};

router.get('/sessions', async (req, res, next) => {
    try {
        const payload = await getSessionsReadModel();
        res.json({
            success: true,
            ...payload,
        });
    } catch (error) {
        next(error);
    }
});

router.get('/sessions/:sessionId/results', sessionIdValidation, async (req, res, next) => {
    try {
        const errors = getValidationErrors(req);
        if (errors) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors,
            });
        }
        const payload = await getSessionResultsReadModel(req.params.sessionId);
        res.json({
            success: true,
            ...payload,
        });
    } catch (error) {
        next(error);
    }
});

router.get('/sessions/:sessionId/stats', sessionIdValidation, async (req, res, next) => {
    try {
        const errors = getValidationErrors(req);
        if (errors) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors,
            });
        }
        const payload = await getSessionStatsReadModel(req.params.sessionId);
        res.json({
            success: true,
            ...payload,
        });
    } catch (error) {
        next(error);
    }
});

router.get('/sessions/:sessionId/allowlist', sessionIdValidation, async (req, res, next) => {
    try {
        const errors = getValidationErrors(req);
        if (errors) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors,
            });
        }
        const payload = await getSessionAllowlistReadModel(req.params.sessionId);
        res.json({
            success: true,
            ...payload,
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
