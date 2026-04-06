const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const { ALLOWED_MIME, validateUploadedImageFile } = require('../utils/imageMagic');
const { appendSignedQuery } = require('../utils/uploadSign');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Created uploads directory');
}

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname).toLowerCase() || '.bin';
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    },
});

const fileFilter = (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
        cb(new Error('Hanya JPEG, PNG, GIF, dan WebP yang diizinkan'), false);
        return;
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
        cb(new Error('Ekstensi file tidak diizinkan'), false);
        return;
    }
    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});

router.post('/', authMiddleware, adminMiddleware, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ success: false, error: 'Ukuran file maksimal 5MB' });
                }
                return res.status(400).json({ success: false, error: err.message });
            }
            return res.status(400).json({ success: false, error: err.message || 'Upload gagal' });
        }

        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'Mohon unggah berkas' });
            }

            const validation = validateUploadedImageFile(req.file.path);
            if (!validation.ok) {
                fs.unlink(req.file.path, () => {});
                return res.status(400).json({ success: false, error: validation.error });
            }

            const currentExt = path.extname(req.file.filename).toLowerCase();
            if (validation.ext && validation.ext !== currentExt) {
                const dir = path.dirname(req.file.path);
                const base = path.basename(req.file.filename, path.extname(req.file.filename));
                const newPath = path.join(dir, base + validation.ext);
                try {
                    fs.renameSync(req.file.path, newPath);
                    req.file.path = newPath;
                    req.file.filename = path.basename(newPath);
                } catch (renameErr) {
                    fs.unlink(req.file.path, () => {});
                    return res.status(500).json({ success: false, error: 'Gagal menyimpan berkas' });
                }
            }

            const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
            const baseFileUrl = `${baseUrl}/uploads/${req.file.filename}`;
            const fileUrl = appendSignedQuery(baseFileUrl, req.file.filename);

            res.json({
                success: true,
                url: fileUrl,
                filename: req.file.filename,
            });
        } catch (e) {
            if (req.file?.path) {
                fs.unlink(req.file.path, () => {});
            }
            res.status(500).json({ success: false, error: 'Upload gagal' });
        }
    });
});

module.exports = router;
