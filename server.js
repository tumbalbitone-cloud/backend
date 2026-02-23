const express = require('express');
const cors = require('cors');
const http = require('http'); // Import http module
require('dotenv').config();

const path = require('path');

const app = express();
const server = http.createServer(app); // Create HTTP server

const connectDB = require('./db');
const PORT = process.env.PORT || 3001;
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { initializeSocket } = require('./utils/socketHandler'); // Import socket handler

// Connect to Database
connectDB();

// Middleware
// CORS configuration - whitelist allowed origins
// CORS_ORIGINS = comma-separated list, e.g. "https://app.com,https://admin.app.com"
// FRONTEND_URL = single origin (fallback if CORS_ORIGINS not set)
const corsWhitelist = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [process.env.FRONTEND_URL || 'http://localhost:3000'];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || corsWhitelist.includes(origin)) {
            callback(null, origin || corsWhitelist[0]);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

app.use(express.json({ limit: '10mb' })); // Limit JSON payload size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
const uploadRoutes = require('./routes/uploadRoutes');

// Routes (admin-only endpoints are protected with adminMiddleware in their routers)
// - POST /api/users/create, POST /api/upload, GET /api/voting/audit/:sessionId → auth + admin
app.use('/api/auth', authRoutes);
app.use('/api/voting', votingRoutes);
app.use('/api/did', didRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize Socket.IO
const io = initializeSocket(server);

// Start server
server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`CORS whitelist: ${corsWhitelist.join(', ')}`);
    console.log(`Health check: http://localhost:${PORT}/`);
    console.log(`Socket.IO initialized`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please stop the other server or use a different port.`);
    } else {
        console.error(`❌ Server error:`, err);
    }
    process.exit(1);
});

