# Troubleshooting Guide

## CORS Errors

Jika Anda melihat error seperti:
```
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource
```

### Solusi 1: Pastikan Backend Server Berjalan

1. Cek apakah server berjalan:
   ```bash
   cd backend
   npm run dev
   ```

2. Test server dengan:
   ```bash
   curl http://localhost:3001/
   ```
   Seharusnya mengembalikan: `{"success":true,"message":"E-Voting Backend is running",...}`

3. Test CORS dengan script:
   ```bash
   node ../scripts/test-server.js
   ```

### Solusi 2: Cek Port dan URL

1. Pastikan backend berjalan di port 3001:
   - Cek di terminal: `Server running on port 3001`
   - Cek di browser: `http://localhost:3001/`

2. Pastikan frontend menggunakan URL yang benar:
   - Frontend: `http://localhost:3000`
   - Backend: `http://localhost:3001`

### Solusi 3: Restart Server

Jika sudah membuat perubahan di kode:

1. Stop server (Ctrl+C)
2. Start ulang:
   ```bash
   npm run dev
   ```

### Solusi 4: Cek Environment Variables

Pastikan file `.env` ada dan berisi:
```env
PORT=3001
FRONTEND_URL=http://localhost:3000
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production-min-32-chars
ADMIN_PRIVATE_KEY=your-admin-private-key
VC_ISSUER_PRIVATE_KEY=your-vc-issuer-private-key
```

### Solusi 5: Clear Browser Cache

1. Hard refresh browser: `Ctrl+Shift+R` (Windows/Linux) atau `Cmd+Shift+R` (Mac)
2. Atau clear browser cache
3. Atau gunakan incognito/private window

### Solusi 6: Cek Network Tab

1. Buka Developer Tools (F12)
2. Buka tab Network
3. Coba request lagi
4. Cek apakah request muncul dan status code-nya

## Common Errors

### Error: "Cannot find module"
**Solusi:** Install dependencies
```bash
cd backend
npm install
```

### Error: "Port already in use"
**Solusi:** 
1. Cari process yang menggunakan port 3001:
   ```bash
   lsof -i :3001  # Linux/Mac
   netstat -ano | findstr :3001  # Windows
   ```
2. Kill process tersebut atau gunakan port lain

### Error: "MongoDB connection failed"
**Solusi:**
1. Pastikan MongoDB berjalan:
   ```bash
   sudo systemctl start mongod  # Linux
   brew services start mongodb-community  # Mac
   ```
2. Atau start MongoDB secara manual

### Error: "JWT_SECRET is not defined"
**Solusi:** Tambahkan ke `.env`:
```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production-min-32-chars
```

### Error: "Missing required environment variable: ADMIN_PRIVATE_KEY"
**Solusi:** Tambahkan private key admin kontrak ke `.env`. Untuk local Hardhat, gunakan salah satu private key akun dummy dari output `npx hardhat node`. Jangan gunakan private key Hardhat default di production.

### Error: "VOTING_SYSTEM_ADDRESS is not set"
**Solusi:** Jalankan deploy kontrak setelah Hardhat node hidup:
```bash
cd contracts
npx hardhat run scripts/deploy_combined.js --network localhost
```
Script deploy akan mengisi `VOTING_SYSTEM_ADDRESS` di `backend/.env` dan `NEXT_PUBLIC_VOTING_SYSTEM_ADDRESS` di `frontend/.env`.

## Testing Endpoints

### Test Health Check
```bash
curl http://localhost:3001/
```

### Test CORS Preflight
```bash
curl -X OPTIONS http://localhost:3001/api/did/status/0x123 \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -v
```

### Test Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"username":"admin","password":"admin123"}'
```

## Still Having Issues?

1. Cek console log di backend untuk error messages
2. Cek browser console untuk error details
3. Pastikan semua dependencies terinstall
4. Pastikan MongoDB berjalan
5. Pastikan Hardhat node berjalan (jika menggunakan blockchain)
