const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const Student = require('../models/Student');
const { adminMiddleware } = require('../middleware/authMiddleware');
const { adminLimiter } = require('../middleware/rateLimiter');
const { AppError } = require('../middleware/errorHandler');

/**
 * @route   POST /api/users/create
 * @desc    Create a new user (Student)
 * @access  Admin only
 */
router.post('/create', adminLimiter, adminMiddleware, [
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
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
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
            password: hashedPassword
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

module.exports = router;
