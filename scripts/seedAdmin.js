require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../db');
const Admin = require('../models/Admin');

async function seedAdmin() {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;

    if (!username || !password) {
        throw new Error('ADMIN_USERNAME dan ADMIN_PASSWORD wajib diisi di file .env');
    }

    if (password.length < 6) {
        throw new Error('ADMIN_PASSWORD minimal 6 karakter');
    }

    await connectDB();

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await Admin.findOneAndUpdate(
        { username },
        {
            username,
            password: hashedPassword,
            role: 'admin'
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );

    console.log(`Admin siap dipakai: ${admin.username}`);
}

seedAdmin()
    .catch((err) => {
        console.error('Gagal seed admin:', err.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.connection.close();
    });
