# Environment Variables Setup

File ini menjelaskan environment variables yang diperlukan untuk backend.

## Cara Setup

1. Copy file ini ke `.env` di folder `backend/`:
   ```bash
   cp ENV_SETUP.md .env
   ```
   Atau buat file `.env` secara manual.

2. Isi semua nilai yang diperlukan (lihat contoh di bawah).

## Environment Variables

### Server Configuration
```env
PORT=3001
NODE_ENV=development
```

### MongoDB Configuration
```env
MONGO_URI=mongodb://localhost:27017/evoting
```

### Admin Credentials
```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

### Admin Private Key
Private key dari Hardhat node Account #1 (untuk deploy contracts dan register voters):
```env
ADMIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```
**PENTING**: Ganti ini di production dengan private key yang aman!

### JWT Configuration
Secret keys untuk JWT signing. Generate dengan:
```bash
openssl rand -base64 32
```

```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production-min-32-chars
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d
```

**PENTING**: 
- `JWT_SECRET` dan `JWT_REFRESH_SECRET` harus minimal 32 karakter
- Gunakan random string yang kuat di production
- Jangan commit `.env` ke git!

### Verifiable Credential (VC) Issuer Configuration
Private key untuk signing Verifiable Credentials:
```env
VC_ISSUER_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001
```

**PENTING**: Gunakan private key yang aman di production!

### Blockchain Configuration
```env
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
```

## Production Checklist

- [ ] Generate strong random secrets untuk JWT_SECRET dan JWT_REFRESH_SECRET
- [ ] Gunakan secure private key untuk ADMIN_PRIVATE_KEY
- [ ] Gunakan secure private key untuk VC_ISSUER_PRIVATE_KEY
- [ ] Set NODE_ENV=production
- [ ] Gunakan secure MongoDB connection string
- [ ] Setup proper firewall dan security measures
- [ ] Jangan commit `.env` file ke version control
