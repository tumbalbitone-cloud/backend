const { verifyToken } = require('../utils/jwt');
const { AppError } = require('./errorHandler');

/**
 * Authentication Middleware
 * Reads token from:
 *   1. httpOnly cookie 'token' (primary — set by login endpoint)
 *   2. Authorization: Bearer <token> header (fallback for API tools / Postman)
 */
const authMiddleware = (req, res, next) => {
    try {
        // 1. Try cookie first (httpOnly — XSS safe)
        let token = req.cookies?.token || null;

        // 2. Fallback: Bearer token from Authorization header
        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader) {
                const parts = authHeader.split(' ');
                if (parts.length === 2 && parts[0] === 'Bearer') {
                    token = parts[1];
                } else {
                    return next(new AppError('Format token tidak valid. Gunakan: Bearer <token>', 401));
                }
            }
        }

        if (!token) {
            return next(new AppError('Token autentikasi tidak ditemukan', 401));
        }

        try {
            const decoded = verifyToken(token);

            req.user = {
                id: decoded.id,
                username: decoded.username,
                role: decoded.role,
                ...(decoded.studentId && { studentId: decoded.studentId }),
            };

            next();
        } catch (verifyErr) {
            if (verifyErr.name === 'TokenExpiredError') {
                return next(new AppError('Token kedaluwarsa. Silakan login kembali.', 401));
            }
            if (verifyErr.name === 'JsonWebTokenError') {
                return next(new AppError('Token tidak valid. Silakan login kembali.', 401));
            }
            throw verifyErr;
        }
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        console.error('[AUTH] Unexpected error:', err);
        next(err);
    }
};

/**
 * Admin Authorization Middleware
 * Must be used after authMiddleware
 */
const adminMiddleware = (req, res, next) => {
    try {
        if (!req.user) {
            throw new AppError('Autentikasi diperlukan', 401);
        }
        if (req.user.role !== 'admin') {
            throw new AppError('Akses admin diperlukan', 403);
        }
        next();
    } catch (err) {
        next(err);
    }
};

/**
 * User Authorization Middleware
 * Must be used after authMiddleware
 */
const userMiddleware = (req, res, next) => {
    try {
        if (!req.user) {
            throw new AppError('Autentikasi diperlukan', 401);
        }
        if (req.user.role !== 'user' && req.user.role !== 'admin') {
            throw new AppError('Akses pengguna diperlukan', 403);
        }
        next();
    } catch (err) {
        next(err);
    }
};

/**
 * Optional Authentication Middleware
 * Verifies token if present, but doesn't fail if missing.
 * Useful for endpoints that work for both authenticated and unauthenticated users.
 */
const optionalAuthMiddleware = (req, res, next) => {
    try {
        let token = req.cookies?.token || null;

        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader) {
                const parts = authHeader.split(' ');
                if (parts.length === 2 && parts[0] === 'Bearer') {
                    token = parts[1];
                }
            }
        }

        if (token) {
            try {
                const decoded = verifyToken(token);
                req.user = {
                    id: decoded.id,
                    username: decoded.username,
                    role: decoded.role,
                    ...(decoded.studentId && { studentId: decoded.studentId }),
                };
            } catch {
                // Invalid or expired token — continue without user
            }
        }

        next();
    } catch (err) {
        next();
    }
};

/**
 * Student-only middleware (role: user).
 * Admins must not impersonate students on DID / student-facing routes.
 */
const studentOnlyMiddleware = (req, res, next) => {
    try {
        if (!req.user) {
            throw new AppError('Autentikasi diperlukan', 401);
        }
        if (req.user.role !== 'user') {
            throw new AppError('Akses khusus mahasiswa diperlukan', 403);
        }
        next();
    } catch (err) {
        next(err);
    }
};

module.exports = {
    authMiddleware,
    adminMiddleware,
    userMiddleware,
    studentOnlyMiddleware,
    optionalAuthMiddleware,
};
