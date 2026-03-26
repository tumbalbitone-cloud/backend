# E-Voting Backend Server

Backend sistem E-Voting (*Node.js*, *Express*) yang menjembatani interaksi antara aplikasi Klien dengan antarmuka penyimpan basis data *MongoDB* serta orkestrasi integrasi sistem ke *Smart Contract Blockchain*.

## Fitur Utama

-   **Autentikasi Terpusat**: Manajemen *JWT Access Token* (15 menit) & *Refresh Token* (7 hari) untuk keamanan memetakan peran (Admin vs Mahasiswa).
-   **Identitas Terdesentralisasi (DID & VC)**: Menerjemahkan *Student ID* dan *Ethereum Address* menjadi satu kesatuan *Verifiable Credential* tersandikan secara kriptografis standar W3C. Memungkinkan *backend* bertindak sebagai proksi admin yang sah untuk memanggil pencetakan NFT akses milik akun pengguna.
-   **Websocket Relay Broker**: Listener aktif menggunakan event logs ethers v6 untuk membroadcast pembaruan state blokchain (*Voted*, *Session Status*) secara sekejap ke aplikasi web (*Socket.IO Server*).
-   **Rate Limiting & Error Handling**: Mitigasi otomatis serangan *brute-force* pada *endpoint* publik, dan penanganan kegagalan transaksi EVM yang ramah pembaca via intersep middleware kustom.

## Prasyarat Lingkungan

- Node.js v18+.
- Basis data **MongoDB** yang sedang berjalan lokal atau tersambung via koneksi String.

## Skema *Environment*

Harap merujuk instruksi pada file [`ENV_SETUP.md`](./ENV_SETUP.md) untuk konfigurasi standar yang dibutuhkan. Intinya Anda perlu menyediakan token rahasia, akun *private key* pendeploy blockchain, alamat kontrak, dan setup koneksi pangkalan data.

## Skrip NPM Tersedia

-   `npm start`: Menjalankan peladen backend *(production mode)*.
-   `npm run dev`: Menjalankan server dalam mode development dengan *Nodemon* (ter-*restart* mandiri apabila ada pembaruan kode moduler backend).

Dokumentasi API interaktif *Swagger* dapat diakses langsung pada port layanan spesifik Anda: `http://localhost:<PORT>/api-docs` apabila *server node* tengah berjalan.
