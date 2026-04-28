const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const Student = require('../models/Student');
const { generateToken, generateRefreshToken } = require('../utils/jwt');
const { AppError } = require('../middleware/errorHandler');
const { authLimiter, refreshLimiter } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/authMiddleware');
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

        const user = await Student.findOne({
            $or: [
                { username },
                { studentId: username }
            ]
        });
        if (!user) {
            throw new AppError('Invalid credentials', 401);
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            throw new AppError('Invalid credentials', 401);
        }

        if (!user.active) {
            throw new AppError('Account is inactive', 403);
        }

        const role = user.role === 'admin' ? 'admin' : 'user';
        const loginUsername = user.username || user.studentId;

        // Generate JWT tokens
        const payload = {
            id: user._id.toString(),
            username: loginUsername,
            role,
            ...(role === 'user' && { studentId: user.studentId })
        };

        const token = generateToken(payload);
        const refreshToken = generateRefreshToken(payload);

        return res.json({
            success: true,
            token,
            refreshToken,
            role,
            username: loginUsername,
            ...(role === 'user' && { studentId: user.studentId })
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
/**
 * @route   GET /api/auth/me
 * @desc    Current user from access token (for client RBAC checks)
 * @access  Private
 */
router.get('/me', authMiddleware, (req, res) => {
    res.json({
        success: true,
        role: req.user.role,
        username: req.user.username,
        ...(req.user.studentId && { studentId: req.user.studentId })
    });
});

router.post('/refresh', refreshLimiter, [
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
            // Expected when refresh token expired or secrets rotated — respond without error middleware stack spam
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired refresh token'
            });
        }
        next(err);
    }
});

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user's password
 * @access  Private
 */
router.put('/change-password', authMiddleware, [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    body('newPassword')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 6 })
        .withMessage('New password must be at least 6 characters')
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

        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (currentPassword === newPassword) {
            throw new AppError('Password baru harus berbeda dari password saat ini', 400);
        }

        const user = await Student.findById(userId);

        if (!user) {
            throw new AppError('User not found', 404);
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            throw new AppError('Password saat ini salah', 401);
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update password
        user.password = hashedPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password berhasil diperbarui'
        });

    } catch (err) {
        next(err);
    }
});

module.exports = router;
