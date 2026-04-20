# E-Voting Backend Server

Backend ini dibangun dengan Node.js + Express dan berperan sebagai lapisan API untuk autentikasi, manajemen user, proses DID/VC, upload aset kandidat, serta relay event blockchain ke frontend melalui Socket.IO.

## Endpoint utama

- `GET /` untuk health check backend.
- `POST /api/auth/login` untuk login admin atau mahasiswa.
- `POST /api/auth/refresh` untuk menukar refresh token menjadi access token baru.
- `GET /api/auth/me` untuk membaca identitas user dari access token.
- `PUT /api/auth/change-password` untuk mengganti password user yang sedang login.
- `POST /api/did/bind/challenge` untuk membuat challenge wallet binding.
- `POST /api/did/bind` untuk memverifikasi signature challenge lalu mengikat wallet ke NIM dan menerbitkan VC.
- `GET /api/did/status/:address` untuk mengecek status binding wallet dan status NFT.
- `POST /api/did/verify-and-register` untuk verifikasi VC lalu mint Student NFT via akun admin backend.
- `GET /api/users/list` untuk pencarian daftar mahasiswa oleh admin.
- `POST /api/users/create` untuk membuat akun mahasiswa baru.
- `POST /api/users/bulk-import` untuk import mahasiswa dari file `CSV`, `XLS`, atau `XLSX`.
- `POST /api/upload` untuk upload gambar kandidat oleh admin.

## Fitur implementasi saat ini

- JWT access token dan refresh token.
- Pemisahan role `admin` dan `user`, plus proteksi `studentOnlyMiddleware` pada route DID.
- Wallet bind berbasis challenge yang ditandatangani user, bukan bind langsung tanpa proof-of-ownership.
- Verifiable Credential yang ditandatangani dengan `did-jwt`.
- Mint Student NFT melalui backend menggunakan `ADMIN_PRIVATE_KEY`.
- Rate limit terpisah untuk API umum, auth, refresh token, DID, voting, dan operasi admin.
- CORS terpusat untuk Express dan Socket.IO melalui [config/corsPolicy.js](/media/udien/DATA/Kuliah/Skripsi/maybe%20fix/backend/config/corsPolicy.js:1).
- Upload gambar dengan validasi MIME/ekstensi dan URL file yang dapat ditandatangani.
- Swagger/OpenAPI di `/api-docs` dan `/api-docs.json`.

## Menjalankan backend

1. Masuk ke folder `backend`.
2. Install dependency dengan `npm install`.
3. Salin `backend/.env.example` menjadi `backend/.env`.
4. Isi variabel yang dibutuhkan, terutama `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_PRIVATE_KEY`, dan `VC_ISSUER_PRIVATE_KEY`.
5. Jalankan server dengan `npm start` atau `npm run dev`.

Catatan: script `dev` saat ini menjalankan `node server.js` juga. Belum ada `nodemon` pada `package.json`, jadi restart otomatis belum dikonfigurasi di backend.

## Environment variables

Ringkasan lengkap ada di [`ENV_SETUP.md`](./ENV_SETUP.md). Variabel yang penting:

- `PORT` untuk port backend, default `3001`.
- `NODE_ENV` untuk mode runtime.
- `MONGO_URI` untuk koneksi MongoDB.
- `FRONTEND_URL` atau `CORS_ORIGINS` untuk whitelist origin frontend.
- `JWT_SECRET` dan `JWT_REFRESH_SECRET` untuk autentikasi.
- `ADMIN_PRIVATE_KEY` untuk mint Student NFT.
- `VC_ISSUER_PRIVATE_KEY` dan opsional `VC_ISSUER_DID` untuk VC issuer.
- `BLOCKCHAIN_RPC_URL` untuk akses blockchain.
- `VOTING_SYSTEM_ADDRESS` untuk alamat kontrak.

Variabel opsional yang juga dipakai kode:

- `BLOCKCHAIN_WS_URL` untuk listener event via WebSocket.
- `EVENT_POLL_INTERVAL_MS` untuk polling fallback event.
- `EVENT_POLL_BACKUP=true` jika ingin memaksa polling walau WS aktif.
- `ENABLE_API_DOCS=true` untuk membuka Swagger di production.
- `BACKEND_URL` untuk base URL upload file.
- `UPLOAD_ALLOW_UNSIGNED=true` untuk mengizinkan akses file upload tanpa signature di production.

## Swagger

Dokumentasi API interaktif tersedia di:

- `http://localhost:3001/api-docs`
- `http://localhost:3001/api-docs.json`

Di production, Swagger hanya aktif bila `ENABLE_API_DOCS=true`.
