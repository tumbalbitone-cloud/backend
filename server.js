const express = require('express');
const cors = require('cors');
const http = require('http');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { verifyUploadQuery } = require('./utils/uploadSign');

const app = express();
const server = http.createServer(app);

const connectDB = require('./db');
const PORT = process.env.PORT || 3001;
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { initializeSocket } = require('./utils/socketHandler');
const { createCorsPolicy } = require('./config/corsPolicy');
const { validateStartupEnvironment } = require('./config/envValidation');

try {
    validateStartupEnvironment();
} catch (e) {
    console.error('❌ Environment validation failed:', e.message);
    process.exit(1);
}

const { corsWhitelist, expressCorsOptions, socketIoCors } = createCorsPolicy(PORT);

connectDB().then(() => {
    // Reset any nftMintInProgress flags left over from a previous crash
    resetStaleMintLocks();
});

/**
 * On startup, clear any nftMintInProgress flags that were stuck due to
 * a server crash mid-mint. Without this, affected users can never mint again.
 */
async function resetStaleMintLocks() {
    try {
        const Student = require('./models/Student');
        const result = await Student.updateMany(
            { nftMintInProgress: true },
            { $set: { nftMintInProgress: false } }
        );
        if (result.modifiedCount > 0) {
            console.log(`[Startup] ✅ Reset ${result.modifiedCount} stuck mint lock(s) (nftMintInProgress)`);
        }
    } catch (err) {
        console.error('[Startup] ❌ Failed to reset stuck mint locks:', err.message);
    }
}

app.use(cors(expressCorsOptions));

// Parse cookies (needed for httpOnly auth cookies)
app.use(cookieParser());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
app.get('/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!filename || filename.includes('..') || /[/\\]/.test(filename)) {
        return res.status(400).json({ success: false, error: 'Invalid filename' });
    }
    const filePath = path.join(uploadsDir, filename);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(uploadsDir))) {
        return res.status(400).json({ success: false, error: 'Invalid filename' });
    }

    const allowLegacy =
        process.env.NODE_ENV !== 'production' || process.env.UPLOAD_ALLOW_UNSIGNED === 'true';

    const { sig, exp } = req.query;
    const okSig = verifyUploadQuery(filename, sig, exp);

    if (!okSig && !allowLegacy) {
        return res.status(403).json({ success: false, error: 'Tautan tidak valid atau kedaluwarsa' });
    }

    if (!fs.existsSync(resolved)) {
        return res.status(404).json({ success: false, error: 'Berkas tidak ditemukan' });
    }

    res.sendFile(resolved);
});

app.use('/api', (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return next();
    }
    apiLimiter(req, res, next);
});

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'E-Voting Backend is running',
        version: '1.0.0',
    });
});

const enableApiDocs =
    process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true';
if (enableApiDocs) {
    const swaggerUi = require('swagger-ui-express');
    const swaggerDocument = require('./config/swagger');
    app.get('/api-docs.json', (req, res) => res.json(swaggerDocument));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, {
        swaggerOptions: {
            url: '/api-docs.json',
            validatorUrl: null,
        },
        explorer: true,
    }));
}

const authRoutes = require('./routes/auth');
const didRoutes = require('./routes/did');
const userRoutes = require('./routes/users');
const uploadRoutes = require('./routes/uploadRoutes');
const readModelRoutes = require('./routes/readModel');
const candidateRoutes = require('./routes/candidates');

app.use('/api/auth', authRoutes);
app.use('/api/did', didRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/read-model', readModelRoutes);
app.use('/api/candidates', candidateRoutes);

app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: 'Route not found',
    });
});

app.use(errorHandler);

initializeSocket(server, { cors: socketIoCors });

server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`CORS whitelist (base): ${corsWhitelist.join(', ')}`);
    console.log(`Health check: http://localhost:${PORT}/`);
    if (enableApiDocs) {
        console.log(`API Docs (Swagger): http://localhost:${PORT}/api-docs`);
    } else {
        console.log('API Docs (Swagger): disabled (set ENABLE_API_DOCS=true in production to enable)');
    }
    console.log('Socket.IO initialized (CORS aligned with Express)');
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please stop the other server or use a different port.`);
    } else {
        console.error('❌ Server error:', err);
    }
    process.exit(1);
});
