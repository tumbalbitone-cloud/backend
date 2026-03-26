/**
 * Error Handling Middleware
 * Provides consistent error responses across the application
 */

class AppError extends Error {
    constructor(message, statusCode, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}

const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log error for debugging
    console.error('Error:', err);

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = 'Resource not found';
        error = new AppError(message, 404);
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const keyPattern = err.keyPattern || {};
        const keyValue = err.keyValue || {};
        const field = Object.keys(keyPattern)[0] || Object.keys(keyValue)[0] || 'field';
        const value = keyValue[field];
        const message = value !== undefined
            ? `${field} already exists (${value})`
            : `${field} already exists`;
        error = new AppError(message, 400);
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(val => val.message);
        const message = messages.join(', ');
        error = new AppError(message, 400);
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        const message = 'Invalid token';
        error = new AppError(message, 401);
    }

    if (err.name === 'TokenExpiredError') {
        const message = 'Token expired';
        error = new AppError(message, 401);
    }

    // Ethers.js errors
    if (err.code === 'CALL_EXCEPTION' || err.code === 'INVALID_ARGUMENT') {
        const message = 'Blockchain transaction failed: ' + (err.reason || err.message);
        error = new AppError(message, 400);
    }

    // Default error
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Server Error';

    res.status(statusCode).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = { errorHandler, AppError };
