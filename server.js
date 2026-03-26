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

// Fail-fast in production if critical secrets are missing
const requireEnv = (key) => {
    const v = process.env[key];
    if (!v || String(v).trim() === '') {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return v;
};

if (process.env.NODE_ENV === 'production') {
    try {
        requireEnv('JWT_SECRET');
        requireEnv('JWT_REFRESH_SECRET');
        requireEnv('ADMIN_PRIVATE_KEY');
        requireEnv('VC_ISSUER_PRIVATE_KEY');
        requireEnv('VOTING_SYSTEM_ADDRESS');
        requireEnv('BLOCKCHAIN_RPC_URL');
    } catch (e) {
        console.error('❌ Production env validation failed:', e.message);
        process.exit(1);
    }
}

// Connect to Database
connectDB();

// Middleware
// CORS configuration - whitelist allowed origins
// CORS_ORIGINS = comma-separated list, e.g. "https://app.com,https://admin.app.com"
// FRONTEND_URL = single origin (fallback if CORS_ORIGINS not set)
const baseWhitelist = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [process.env.FRONTEND_URL || 'http://localhost:3000'];

// Tambah origin backend untuk Swagger UI (Try it out) - request dari /api-docs
const corsWhitelist = [
    ...baseWhitelist,
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`
];

// Development: allow localhost, 127.0.0.1, dan private network (192.168.x.x, 10.x.x.x) di port manapun
const isDev = process.env.NODE_ENV !== 'production';
const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (corsWhitelist.includes(origin)) return true;
    if (isDev) {
        try {
            const u = new URL(origin);
            const hostname = u.hostname;
            if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
            const parts = hostname.split('.').map(Number);
            if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.x.x
            if (parts[0] === 10) return true; // 10.x.x.x
        } catch (_) { /* invalid URL */ }
    }
    return false;
};

app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
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

// API Documentation (Swagger UI) - http://localhost:3001/api-docs
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./config/swagger');
app.get('/api-docs.json', (req, res) => res.json(swaggerDocument));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, {
    swaggerOptions: {
        url: '/api-docs.json',
        validatorUrl: null
    },
    explorer: true
}));

// Import routes
const authRoutes = require('./routes/auth');
const didRoutes = require('./routes/did');
const userRoutes = require('./routes/users');
const uploadRoutes = require('./routes/uploadRoutes');

// Routes
app.use('/api/auth', authRoutes);
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
    console.log(`API Docs (Swagger): http://localhost:${PORT}/api-docs`);
    console.log(`Socket.IO initialized`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please stop the other server or use a different port.`);
    } else {
        console.error(`❌ Server error:`, err);
    }
    process.exit(1);
});

