const mongoose = require('mongoose');
const Student = require('../models/Student');
require('dotenv').config({ path: '../.env' }); // Adjust path if needed

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/evoting');
        console.log('MongoDB Connected for seeding');

        const students = [
            { studentId: 'student1', name: 'Alice', active: true },
            { studentId: 'student2', name: 'Bob', active: true },
            { studentId: 'student3', name: 'Charlie', active: true }
        ];

        await Student.deleteMany({}); // Clear existing
        await Student.insertMany(students);

        console.log('Seed data inserted');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedData();
