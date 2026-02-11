const { verifyToken } = require('../utils/jwt');
const { AppError } = require('./errorHandler');

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user info to request
 */
const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            console.log('[AUTH] No authorization header');
            throw new AppError('No token provided', 401);
        }

        // Extract token from "Bearer <token>"
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            console.log('[AUTH] Invalid token format:', authHeader.substring(0, 20) + '...');
            throw new AppError('Invalid token format. Use: Bearer <token>', 401);
        }

        const token = parts[1];

        // Verify token
        try {
            const decoded = verifyToken(token);
            console.log('[AUTH] Token verified for user:', decoded.username || decoded.studentId);

            // Attach user info to request
            req.user = {
                id: decoded.id,
                username: decoded.username,
                role: decoded.role,
                ...(decoded.studentId && { studentId: decoded.studentId })
            };

            next();
        } catch (verifyErr) {
            console.log('[AUTH] Token verification failed:', verifyErr.name, verifyErr.message);
            if (verifyErr.name === 'TokenExpiredError') {
                return next(new AppError('Token expired. Please login again.', 401));
            }
            if (verifyErr.name === 'JsonWebTokenError') {
                return next(new AppError('Invalid token. Please login again.', 401));
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
 * Checks if user has admin role
 */
const adminMiddleware = (req, res, next) => {
    try {
        if (!req.user) {
            throw new AppError('Authentication required', 401);
        }

        if (req.user.role !== 'admin') {
            throw new AppError('Admin access required', 403);
        }

        next();
    } catch (err) {
        next(err);
    }
};

/**
 * User Authorization Middleware
 * Ensures user can only access their own resources
 * Must be used after authMiddleware
 */
const userMiddleware = (req, res, next) => {
    try {
        if (!req.user) {
            throw new AppError('Authentication required', 401);
        }

        if (req.user.role !== 'user' && req.user.role !== 'admin') {
            throw new AppError('User access required', 403);
        }

        next();
    } catch (err) {
        next(err);
    }
};

/**
 * Optional Authentication Middleware
 * Verifies token if present, but doesn't fail if missing
 * Useful for endpoints that work for both authenticated and unauthenticated users
 */
const optionalAuthMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader) {
            const parts = authHeader.split(' ');
            if (parts.length === 2 && parts[0] === 'Bearer') {
                const token = parts[1];
                const decoded = verifyToken(token);
                req.user = {
                    id: decoded.id,
                    username: decoded.username,
                    role: decoded.role,
                    ...(decoded.studentId && { studentId: decoded.studentId })
                };
            }
        }

        next();
    } catch (err) {
        // If token is invalid, just continue without user
        // This is optional auth, so we don't fail
        next();
    }
};

module.exports = {
    authMiddleware,
    adminMiddleware,
    userMiddleware,
    optionalAuthMiddleware
};

