# Environment Variables Setup

Dokumen ini mengikuti variabel yang benar-benar dipakai oleh backend saat startup dan saat request diproses.

## Cara setup

1. Masuk ke folder `backend/`.
2. Salin file contoh:

```bash
cp .env.example .env
```

3. Isi nilainya sesuai environment Anda.

## Variabel wajib

Backend akan gagal startup jika variabel berikut kosong:

```env
JWT_SECRET=
JWT_REFRESH_SECRET=
ADMIN_PRIVATE_KEY=
VC_ISSUER_PRIVATE_KEY=
```

Di mode `production`, dua variabel berikut juga wajib:

```env
BLOCKCHAIN_RPC_URL=
VOTING_SYSTEM_ADDRESS=
```

## Contoh konfigurasi minimum development

```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

MONGO_URI=mongodb://localhost:27017/evoting

ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

ADMIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
VC_ISSUER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

JWT_SECRET=replace-with-strong-secret
JWT_REFRESH_SECRET=replace-with-strong-refresh-secret
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d

BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
VOTING_SYSTEM_ADDRESS=0xYourContractAddress
```

## Penjelasan variabel

### Server dan CORS

```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

- `PORT`: port backend Express dan server Socket.IO.
- `NODE_ENV`: memengaruhi validasi startup, stack trace error, dan exposure Swagger.
- `FRONTEND_URL`: fallback origin frontend bila `CORS_ORIGINS` tidak diisi.

Jika Anda punya lebih dari satu origin frontend, gunakan:

```env
CORS_ORIGINS=http://localhost:3000,https://app.example.com
```

### Database

```env
MONGO_URI=mongodb://localhost:27017/evoting
```

`MONGO_URI` dipakai untuk koneksi Mongoose. Jika tidak diisi, `db.js` masih memiliki fallback ke `mongodb://localhost:27017/evoting`.

### Akun admin aplikasi

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

Variabel ini dipakai untuk kebutuhan seed/setup akun admin, bukan sebagai pengganti login JWT.

### Identitas blockchain admin

```env
ADMIN_ADDRESS=
ADMIN_PRIVATE_KEY=
```

- `ADMIN_PRIVATE_KEY` dipakai backend saat memanggil kontrak untuk mint Student NFT.
- `ADMIN_ADDRESS` tersedia di `.env.example`, tetapi saat ini tidak dibaca langsung oleh kode backend.

### JWT

```env
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d
```

- `JWT_SECRET`: access token dan wallet bind challenge.
- `JWT_REFRESH_SECRET`: refresh token.
- `JWT_EXPIRE`: default access token, fallback di code adalah `1h` untuk non-production dan `15m` untuk production bila tidak diisi.
- `JWT_REFRESH_EXPIRE`: default refresh token, fallback `7d`.

### Verifiable Credential

```env
VC_ISSUER_PRIVATE_KEY=
VC_ISSUER_DID=did:web:university.edu
```

- `VC_ISSUER_PRIVATE_KEY` wajib untuk signing dan verifikasi VC.
- `VC_ISSUER_DID` opsional. Jika kosong, backend memakai default `did:web:university.edu`.

### Blockchain

```env
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
VOTING_SYSTEM_ADDRESS=
```

- `BLOCKCHAIN_RPC_URL` dipakai saat cek NFT, verifikasi dan mint DID, serta fallback event listener.
- `VOTING_SYSTEM_ADDRESS` adalah alamat kontrak `VotingSystem`.

### Event listener opsional

```env
BLOCKCHAIN_WS_URL=ws://127.0.0.1:8545
EVENT_POLL_INTERVAL_MS=5000
EVENT_POLL_BACKUP=false
```

- `BLOCKCHAIN_WS_URL` dipakai jika ingin listener event memakai WebSocket provider.
- `EVENT_POLL_INTERVAL_MS` mengatur interval polling fallback.
- `EVENT_POLL_BACKUP=true` memaksa polling tetap aktif walaupun WebSocket provider tersedia.

### Dokumentasi dan upload

```env
ENABLE_API_DOCS=false
BACKEND_URL=http://localhost:3001
UPLOAD_ALLOW_UNSIGNED=false
```

- `ENABLE_API_DOCS=true` diperlukan agar Swagger tetap aktif di production.
- `BACKEND_URL` dipakai untuk membentuk URL file upload.
- `UPLOAD_ALLOW_UNSIGNED=true` mengizinkan akses file upload tanpa query signature di production. Dalam development, file upload tetap dapat diakses tanpa signature.

## Catatan keamanan

- Jangan pakai private key Hardhat default di production.
- Gunakan secret acak yang panjang untuk `JWT_SECRET` dan `JWT_REFRESH_SECRET`.
- Jangan commit file `.env`.
- Pisahkan `VC_ISSUER_PRIVATE_KEY` dari `ADMIN_PRIVATE_KEY` di production.
