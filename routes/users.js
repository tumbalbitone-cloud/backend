const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const { body, query, validationResult } = require('express-validator');
const Student = require('../models/Student');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const { adminLimiter } = require('../middleware/rateLimiter');
const { AppError } = require('../middleware/errorHandler');

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BULK_IMPORT_DEFAULT_PASSWORD = 'password123';
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB
    }
});

const STUDENT_ID_REGEX = /^[a-zA-Z0-9]+$/;

const getCellValue = (row = {}, aliases = []) => {
    const normalizedRow = {};
    for (const [key, value] of Object.entries(row)) {
        normalizedRow[String(key).trim().toLowerCase()] = value;
    }

    for (const alias of aliases) {
        const value = normalizedRow[alias.toLowerCase()];
        if (value !== undefined && value !== null) {
            return String(value).trim();
        }
    }

    return '';
};

const splitCsvLine = (line = '') => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current.trim());
    return values;
};

const parseCsvBuffer = (buffer) => {
    const raw = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length < 2) {
        throw new AppError('CSV minimal harus memiliki header dan 1 baris data', 400);
    }

    const headers = splitCsvLine(lines[0]).map((header) => header.trim());
    return lines.slice(1).map((line) => {
        const values = splitCsvLine(line);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        return row;
    });
};

const parseSpreadsheetFile = (file) => {
    const ext = String(file.originalname || '')
        .toLowerCase()
        .split('.')
        .pop();

    if (ext === 'csv') {
        return parseCsvBuffer(file.buffer);
    }

    if (ext === 'xls' || ext === 'xlsx') {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
            throw new AppError('File Excel tidak memiliki sheet', 400);
        }
        const worksheet = workbook.Sheets[firstSheetName];
        return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    }

    throw new AppError('Format file tidak didukung. Gunakan CSV, XLS, atau XLSX', 400);
};

const normalizeImportRows = (rows) => {
    return rows.map((row, index) => {
        const studentId = getCellValue(row, ['studentid', 'student_id', 'nim', 'username', 'id']);
        const name = getCellValue(row, ['name', 'nama', 'fullname', 'full_name', 'nama lengkap']);

        return {
            line: index + 2, // +2 because first row is header
            studentId,
            name
        };
    });
};

/**
 * @route   GET /api/users/list
 * @desc    Get student list for admin picker (name/NIM)
 * @access  Admin only (token + role admin required)
 */
router.get('/list', adminLimiter, authMiddleware, adminMiddleware, [
    query('q')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Search query must be at most 100 characters'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('Limit must be an integer between 1 and 1000')
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const q = String(req.query.q || '').trim();
        const limit = parseInt(req.query.limit, 10) || 300;

        const filter = {};
        if (q) {
            const safeQuery = escapeRegex(q);
            filter.$or = [
                { studentId: { $regex: safeQuery, $options: 'i' } },
                { name: { $regex: safeQuery, $options: 'i' } }
            ];
        }

        const students = await Student.find(
            filter,
            'studentId name active claimedBy'
        )
            .sort({ studentId: 1 })
            .limit(limit);

        res.json({
            success: true,
            students: students.map((student) => ({
                studentId: student.studentId,
                name: student.name,
                active: student.active,
                claimedBy: student.claimedBy || null
            }))
        });
    } catch (err) {
        next(err);
    }
});

/**
 * @route   POST /api/users/create
 * @desc    Create a new user (Student)
 * @access  Admin only (token + role admin required)
 */
router.post('/create', adminLimiter, authMiddleware, adminMiddleware, [
    body('studentId')
        .trim()
        .notEmpty()
        .withMessage('Student ID is required')
        .isLength({ min: 3 })
        .withMessage('Student ID must be at least 3 characters')
        .matches(/^[a-zA-Z0-9]+$/)
        .withMessage('Student ID must contain only alphanumeric characters'),
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
], async (req, res, next) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { studentId, name, password } = req.body;

        // Check for existing user
        const existingStudent = await Student.findOne({ studentId });
        if (existingStudent) {
            throw new AppError('User already exists', 400);
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newStudent = new Student({
            studentId,
            name,
            password: hashedPassword,
            claimedByNormalized: undefined
        });

        const savedStudent = await newStudent.save();

        res.json({
            success: true,
            message: "User created successfully",
            student: {
                id: savedStudent.id,
                studentId: savedStudent.studentId,
                name: savedStudent.name,
                active: savedStudent.active
            }
        });
    } catch (err) {
        next(err);
    }
});

/**
 * @route   POST /api/users/bulk-import
 * @desc    Bulk import students from CSV/Excel
 * @access  Admin only (token + role admin required)
 */
router.post('/bulk-import', adminLimiter, authMiddleware, adminMiddleware, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            throw new AppError('File wajib diunggah', 400);
        }

        const parsedRows = parseSpreadsheetFile(req.file);
        if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
            throw new AppError('File tidak berisi data yang bisa diproses', 400);
        }

        const rows = normalizeImportRows(parsedRows);
        const failed = [];
        const candidates = [];
        const seenInFile = new Set();
        const salt = await bcrypt.genSalt(10);
        const hashedBulkPassword = await bcrypt.hash(BULK_IMPORT_DEFAULT_PASSWORD, salt);

        for (const row of rows) {
            if (!row.studentId && !row.name) {
                continue;
            }

            if (!row.studentId || !row.name) {
                failed.push({
                    line: row.line,
                    studentId: row.studentId || null,
                    reason: 'Kolom studentId/nim dan name/nama wajib diisi'
                });
                continue;
            }

            if (row.studentId.length < 3 || !STUDENT_ID_REGEX.test(row.studentId)) {
                failed.push({
                    line: row.line,
                    studentId: row.studentId,
                    reason: 'studentId/nim minimal 3 karakter dan hanya boleh huruf/angka'
                });
                continue;
            }

            if (row.name.length < 2 || row.name.length > 100) {
                failed.push({
                    line: row.line,
                    studentId: row.studentId,
                    reason: 'Nama harus 2-100 karakter'
                });
                continue;
            }

            const dedupeKey = row.studentId.toLowerCase();
            if (seenInFile.has(dedupeKey)) {
                failed.push({
                    line: row.line,
                    studentId: row.studentId,
                    reason: 'Duplikat studentId/nim di dalam file'
                });
                continue;
            }

            seenInFile.add(dedupeKey);
            candidates.push(row);
        }

        if (candidates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Tidak ada data valid untuk diimpor',
                summary: {
                    totalRows: rows.length,
                    created: 0,
                    failed: failed.length
                },
                failed
            });
        }

        const existingStudentIds = new Set(
            (await Student.find(
                { studentId: { $in: candidates.map((item) => item.studentId) } },
                'studentId'
            )).map((student) => student.studentId.toLowerCase())
        );

        const toInsert = [];
        for (const row of candidates) {
            if (existingStudentIds.has(row.studentId.toLowerCase())) {
                failed.push({
                    line: row.line,
                    studentId: row.studentId,
                    reason: 'studentId/nim sudah terdaftar'
                });
                continue;
            }

            toInsert.push({
                studentId: row.studentId,
                name: row.name,
                password: hashedBulkPassword,
                claimedByNormalized: undefined
            });
        }

        if (toInsert.length > 0) {
            await Student.insertMany(toInsert, { ordered: false });
        }

        res.json({
            success: true,
            message: `Import selesai. ${toInsert.length} akun berhasil dibuat dengan password default ${BULK_IMPORT_DEFAULT_PASSWORD}.`,
            summary: {
                totalRows: rows.length,
                created: toInsert.length,
                failed: failed.length,
                defaultPassword: BULK_IMPORT_DEFAULT_PASSWORD
            },
            failed
        });
    } catch (err) {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return next(new AppError('Ukuran file maksimal 5 MB', 400));
            }
            return next(new AppError('Upload file gagal', 400));
        }
        next(err);
    }
});

/**
 * @route   POST /api/users/resolve-voter-addresses
 * @desc    Resolve student IDs to bound wallet addresses for session voter allowlist
 * @access  Admin only (token + role admin required)
 */
router.post('/resolve-voter-addresses', adminLimiter, authMiddleware, adminMiddleware, [
    body('studentIds')
        .isArray({ min: 1, max: 500 })
        .withMessage('studentIds must be an array with 1-500 items'),
    body('studentIds.*')
        .trim()
        .notEmpty()
        .withMessage('Each student ID must be non-empty')
        .isLength({ min: 3 })
        .withMessage('Each student ID must be at least 3 characters')
        .matches(/^[a-zA-Z0-9]+$/)
        .withMessage('Student ID must contain only alphanumeric characters')
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const normalizedStudentIds = [...new Set(
            req.body.studentIds.map((id) => String(id).trim())
        )];

        const students = await Student.find(
            { studentId: { $in: normalizedStudentIds } },
            'studentId name active claimedBy'
        );

        const studentMap = new Map(students.map((student) => [student.studentId, student]));
        const resolved = [];
        const unresolved = [];

        for (const studentId of normalizedStudentIds) {
            const student = studentMap.get(studentId);

            if (!student) {
                unresolved.push({ studentId, reason: 'not_found' });
                continue;
            }

            if (!student.active) {
                unresolved.push({ studentId, name: student.name, reason: 'inactive' });
                continue;
            }

            if (!student.claimedBy) {
                unresolved.push({ studentId, name: student.name, reason: 'wallet_not_bound' });
                continue;
            }

            resolved.push({
                studentId,
                name: student.name,
                address: student.claimedBy
            });
        }

        res.json({
            success: true,
            resolved,
            unresolved
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
