const mongoose = require('mongoose');
const Student = require('../models/Student');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env' });

const dummyStudents = [
    { studentId: "12345001", name: "Ahmad Dahlan", password: "password123" },
    { studentId: "12345002", name: "Budi Santoso", password: "password123" },
    { studentId: "12345003", name: "Citra Kirana", password: "password123" },
    { studentId: "12345004", name: "Dewi Persik", password: "password123" },
    { studentId: "12345005", name: "Eko Patrio", password: "password123" },
    { studentId: "12345006", name: "Fajar Sadboy", password: "password123" },
];

const seedDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB under URI:', process.env.MONGO_URI);

        // Clear existing students
        await Student.deleteMany({});
        console.log('Cleared existing student data');

        // Hash passwords
        const studentsWithHashedPasswords = await Promise.all(dummyStudents.map(async (student) => {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(student.password, salt);
            return { ...student, password: hashedPassword };
        }));

        // Insert new students
        await Student.insertMany(studentsWithHashedPasswords);
        console.log('Inserted dummy student data');

        mongoose.connection.close();
        console.log('Connection closed');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedDB();
