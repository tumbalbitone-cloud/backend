/**
 * Rate Limiting Middleware
 * Protects endpoints from abuse and brute force attacks
 */

const rateLimit = require('express-rate-limit');

/**
 * General API Rate Limiter
 * 100 requests per 15 minutes per IP
 * Skips OPTIONS requests (preflight)
 */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip: (req) => req.method === 'OPTIONS' // Skip preflight requests
});

/**
 * Strict Rate Limiter for Authentication
 * 5 requests per 15 minutes per IP
 * Prevents brute force attacks
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login requests per windowMs
    message: {
        success: false,
        error: 'Too many login attempts from this IP, please try again after 15 minutes.'
    },
    skipSuccessfulRequests: true, // Don't count successful requests
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Rate Limiter for DID Operations
 * 10 requests per hour per IP
 * Prevents abuse of wallet binding and verification
 */
const didLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 DID operations per hour
    message: {
        success: false,
        error: 'Too many DID operations from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Rate Limiter for Voting Operations
 * 3 requests per minute per IP
 * Prevents spam voting attempts
 */
const votingLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 3, // Limit each IP to 3 voting operations per minute
    message: {
        success: false,
        error: 'Too many voting attempts, please try again in a moment.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Rate Limiter for Admin Operations
 * 20 requests per minute per IP
 * More lenient for admin operations but still protected
 */
const adminLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // Limit each IP to 20 admin operations per minute
    message: {
        success: false,
        error: 'Too many admin operations, please slow down.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    apiLimiter,
    authLimiter,
    didLimiter,
    votingLimiter,
    adminLimiter
};
