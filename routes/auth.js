const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const Student = require('../models/Student');
const RefreshToken = require('../models/RefreshToken');
const { generateToken, generateRefreshToken } = require('../utils/jwt');
const { AppError } = require('../middleware/errorHandler');
const { authLimiter, refreshLimiter } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/authMiddleware');
require('dotenv').config();

// -------------------------------------------------------------------
// Cookie configuration helpers
// -------------------------------------------------------------------

/** Parse JWT_REFRESH_EXPIRE env (e.g. "7d") into milliseconds */
const parseExpireMs = (envValue, defaultDays) => {
    const val = envValue || `${defaultDays}d`;
    const match = val.match(/^(\d+)([smhd])$/);
    if (!match) return defaultDays * 24 * 60 * 60 * 1000;
    const n = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return n * (multipliers[unit] || 86_400_000);
};

const ACCESS_TOKEN_MS = parseExpireMs(process.env.JWT_EXPIRE, 0.25); // default 15m
const REFRESH_TOKEN_MS = parseExpireMs(process.env.JWT_REFRESH_EXPIRE, 7); // default 7d

/**
 * Build cookie options.
 * - httpOnly: inaccessible to JS (XSS mitigation)
 * - secure: HTTPS only in production
 * - sameSite: 'none' when cross-origin (different domains), else 'lax'
 * - Set COOKIE_SAME_SITE=none in env when frontend/backend are on different domains
 */
const makeCookieOptions = (maxAgeMs) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const crossOrigin = process.env.COOKIE_SAME_SITE === 'none';
    return {
        httpOnly: true,
        secure: isProduction || crossOrigin,
        sameSite: crossOrigin ? 'none' : 'lax',
        maxAge: maxAgeMs,
        path: '/',
    };
};

/** Set auth cookies on the response */
const setAuthCookies = (res, accessToken, refreshToken) => {
    res.cookie('token', accessToken, makeCookieOptions(ACCESS_TOKEN_MS));
    res.cookie('refreshToken', refreshToken, makeCookieOptions(REFRESH_TOKEN_MS));
};

/** Clear auth cookies */
const clearAuthCookies = (res) => {
    const base = { httpOnly: true, path: '/' };
    res.clearCookie('token', base);
    res.clearCookie('refreshToken', base);
};

// -------------------------------------------------------------------
// POST /api/auth/login
// -------------------------------------------------------------------
/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user — tokens returned as httpOnly cookies
 * @access  Public
 */
router.post('/login', authLimiter, [
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Username wajib diisi'),
    body('password')
        .notEmpty()
        .withMessage('Password wajib diisi')
        .isLength({ min: 6 })
        .withMessage('Password minimal 6 karakter'),
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validasi gagal',
                details: errors.array(),
            });
        }

        const { username, password } = req.body;

        const user = await Student.findOne({
            $or: [{ username }, { studentId: username }],
        });
        if (!user) {
            throw new AppError('Username atau password salah', 401);
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            throw new AppError('Username atau password salah', 401);
        }

        if (!user.active) {
            throw new AppError('Akun tidak aktif', 403);
        }

        const role = user.role === 'admin' ? 'admin' : 'user';
        const loginUsername = user.username || user.studentId;

        const payload = {
            id: user._id.toString(),
            username: loginUsername,
            role,
            ...(role === 'user' && { studentId: user.studentId }),
        };

        const accessToken = generateToken(payload);
        const refreshToken = generateRefreshToken(payload);

        // Persist hashed refresh token in DB (rotation + revocation support)
        await RefreshToken.createRecord(user._id, refreshToken, REFRESH_TOKEN_MS);

        // Send tokens via httpOnly cookies — NOT in the response body
        setAuthCookies(res, accessToken, refreshToken);

        // Only return non-sensitive session info in the body
        return res.json({
            success: true,
            role,
            username: loginUsername,
            ...(role === 'user' && { studentId: user.studentId }),
        });
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------
// GET /api/auth/me
// -------------------------------------------------------------------
/**
 * @route   GET /api/auth/me
 * @desc    Return current user info from access token (for RBAC checks)
 * @access  Private
 */
router.get('/me', authMiddleware, async (req, res, next) => {
    try {
        const user = await Student.findById(req.user.id);
        res.json({
            success: true,
            role: req.user.role,
            username: req.user.username,
            claimedBy: user ? user.claimedBy : undefined,
            ...(req.user.studentId && { studentId: req.user.studentId }),
        });
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------
// POST /api/auth/refresh
// -------------------------------------------------------------------
/**
 * @route   POST /api/auth/refresh
 * @desc    Rotate refresh token — old token is invalidated, new tokens issued
 * @access  Public (uses httpOnly cookie, no body needed)
 */
router.post('/refresh', refreshLimiter, async (req, res, next) => {
    try {
        // Read refresh token from cookie (httpOnly) or fallback to body for API tools
        const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (!rawRefreshToken) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token tidak ditemukan. Silakan login kembali.',
            });
        }

        const { verifyRefreshToken } = require('../utils/jwt');

        // 1. Verify JWT signature and expiry
        let decoded;
        try {
            decoded = verifyRefreshToken(rawRefreshToken);
        } catch (err) {
            clearAuthCookies(res);
            return res.status(401).json({
                success: false,
                error: 'Refresh token tidak valid atau sudah kedaluwarsa. Silakan login kembali.',
            });
        }

        // 2. Verify token exists in DB (not already used/revoked)
        const record = await RefreshToken.findByRawToken(rawRefreshToken);
        if (!record) {
            // Possible token reuse attack — clear all tokens for this user
            await RefreshToken.deleteAllForUser(decoded.id);
            clearAuthCookies(res);
            return res.status(401).json({
                success: false,
                error: 'Token tidak valid (sudah digunakan atau dicabut). Silakan login kembali.',
            });
        }

        // 3. Delete the old refresh token (rotation — one-time use)
        await RefreshToken.deleteByRawToken(rawRefreshToken);

        // 4. Issue new token pair
        const newPayload = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role,
            ...(decoded.studentId && { studentId: decoded.studentId }),
        };

        const newAccessToken = generateToken(newPayload);
        const newRefreshToken = generateRefreshToken(newPayload);

        // 5. Persist new refresh token in DB
        await RefreshToken.createRecord(decoded.id, newRefreshToken, REFRESH_TOKEN_MS);

        // 6. Set new cookies
        setAuthCookies(res, newAccessToken, newRefreshToken);

        return res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------
// POST /api/auth/logout
// -------------------------------------------------------------------
/**
 * @route   POST /api/auth/logout
 * @desc    Invalidate refresh token in DB and clear auth cookies
 * @access  Public (works even with expired access token)
 */
router.post('/logout', async (req, res, next) => {
    try {
        const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (rawRefreshToken) {
            // Delete from DB — ignore errors (token may already be expired/removed)
            await RefreshToken.deleteByRawToken(rawRefreshToken).catch(() => {});
        }

        clearAuthCookies(res);

        return res.json({
            success: true,
            message: 'Berhasil keluar dari akun.',
        });
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------
// PUT /api/auth/change-password
// -------------------------------------------------------------------
/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user's password
 * @access  Private
 */
router.put('/change-password', authMiddleware, [
    body('currentPassword')
        .notEmpty()
        .withMessage('Password saat ini wajib diisi'),
    body('newPassword')
        .notEmpty()
        .withMessage('Password baru wajib diisi')
        .isLength({ min: 6 })
        .withMessage('Password baru minimal 6 karakter'),
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validasi gagal',
                details: errors.array(),
            });
        }

        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (currentPassword === newPassword) {
            throw new AppError('Password baru harus berbeda dari password saat ini', 400);
        }

        const user = await Student.findById(userId);
        if (!user) {
            throw new AppError('Pengguna tidak ditemukan', 404);
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            throw new AppError('Password saat ini salah', 401);
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        // Invalidate all active refresh tokens — force re-login on other devices
        await RefreshToken.deleteAllForUser(userId);
        clearAuthCookies(res);

        res.json({
            success: true,
            message: 'Password berhasil diperbarui. Silakan login kembali.',
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
