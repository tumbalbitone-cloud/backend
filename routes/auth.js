const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const Student = require('../models/Student');
const { generateToken, generateRefreshToken } = require('../utils/jwt');
const { AppError } = require('../middleware/errorHandler');
const { authLimiter } = require('../middleware/rateLimiter');
require('dotenv').config();

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and get JWT tokens
 * @access  Public
 */
router.post('/login', authLimiter, [
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Username is required'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
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

        const { username, password } = req.body;

        // 1. Check for Admin
        if (username === process.env.ADMIN_USERNAME) {
            if (password === process.env.ADMIN_PASSWORD) {
                const payload = {
                    id: 'admin',
                    username: process.env.ADMIN_USERNAME,
                    role: 'admin'
                };

                const token = generateToken(payload);
                const refreshToken = generateRefreshToken(payload);

                return res.json({
                    success: true,
                    token,
                    refreshToken,
                    role: 'admin',
                    username: process.env.ADMIN_USERNAME
                });
            } else {
                throw new AppError('Invalid credentials', 401);
            }
        }

        // 2. Check for Student
        const student = await Student.findOne({ studentId: username });
        if (!student) {
            throw new AppError('Invalid credentials', 401);
        }

        const isMatch = await bcrypt.compare(password, student.password);
        if (!isMatch) {
            throw new AppError('Invalid credentials', 401);
        }

        if (!student.active) {
            throw new AppError('Account is inactive', 403);
        }

        // Generate JWT tokens
        const payload = {
            id: student._id.toString(),
            studentId: student.studentId,
            username: student.studentId,
            role: 'user'
        };

        const token = generateToken(payload);
        const refreshToken = generateRefreshToken(payload);

        return res.json({
            success: true,
            token,
            refreshToken,
            role: 'user',
            username: student.studentId,
            studentId: student.studentId
        });

    } catch (err) {
        next(err);
    }
});

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh', [
    body('refreshToken')
        .notEmpty()
        .withMessage('Refresh token is required')
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { refreshToken } = req.body;
        const { verifyRefreshToken, generateToken } = require('../utils/jwt');

        // Verify refresh token
        const decoded = verifyRefreshToken(refreshToken);

        // Generate new access token
        const newPayload = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role,
            ...(decoded.studentId && { studentId: decoded.studentId })
        };

        const newToken = generateToken(newPayload);

        return res.json({
            success: true,
            token: newToken
        });

    } catch (err) {
        if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
            return next(new AppError('Invalid or expired refresh token', 401));
        }
        next(err);
    }
});

module.exports = router;
