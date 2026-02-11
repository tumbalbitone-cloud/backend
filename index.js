const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const connectDB = require('./db');
const PORT = process.env.PORT || 3001;
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Connect to Database
connectDB();

// Middleware
// CORS configuration - allow requests from frontend
// Must be before other middleware
// CORS middleware automatically handles OPTIONS preflight requests
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

app.use(express.json({ limit: '10mb' })); // Limit JSON payload size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply general rate limiting to all API routes (but skip OPTIONS)
app.use('/api', (req, res, next) => {
    // Skip rate limiting for OPTIONS requests (preflight)
    if (req.method === 'OPTIONS') {
        return next();
    }
    apiLimiter(req, res, next);
});

// Health check route (not rate limited)
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'E-Voting Backend is running',
        version: '1.0.0'
    });
});

// Import routes
const authRoutes = require('./routes/auth');
const votingRoutes = require('./routes/voting');
const didRoutes = require('./routes/did');
const userRoutes = require('./routes/users');

app.use('/api/auth', authRoutes);
app.use('/api/voting', votingRoutes);
app.use('/api/did', didRoutes);
app.use('/api/users', userRoutes);

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log(`Health check: http://localhost:${PORT}/`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please stop the other server or use a different port.`);
    } else {
        console.error(`❌ Server error:`, err);
    }
    process.exit(1);
});

