/**
 * OpenAPI (Swagger) specification untuk E-Voting API
 * Diakses via /api-docs
 */

const swaggerDocument = {
    openapi: '3.0.0',
    info: {
        title: 'E-Voting API with DID',
        version: '1.0.0',
        description: `
API untuk sistem E-Voting berbasis blockchain dengan identitas digital terdesentralisasi (DID).
Digunakan untuk organisasi kemahasiswaan.

## Autentikasi
Kebanyakan endpoint memerlukan **Bearer Token** (JWT). Dapatkan token via \`POST /api/auth/login\`.

Format header: \`Authorization: Bearer <token>\`

## Peran (Roles)
- **admin**: Akses penuh (manajemen user, upload)
- **user**: Mahasiswa (bind wallet, claim NFT, vote)

## Alur Bind Wallet
1. Login sebagai mahasiswa.
2. Panggil \`POST /api/did/bind/challenge\` untuk membuat pesan challenge.
3. Tanda tangani message tersebut dengan wallet.
4. Kirim signature ke \`POST /api/did/bind\`.
5. Jika perlu mint NFT, gunakan \`POST /api/did/verify-and-register\`.
        `,
        contact: {
            name: 'E-Voting System'
        }
    },
    servers: [
        {
            url: 'http://localhost:3001',
            description: 'Development server'
        }
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT'
            }
        },
        schemas: {
            Error: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    error: { type: 'string', example: 'Validation failed' },
                    stack: {
                        type: 'string',
                        description: 'Hanya muncul di environment development'
                    }
                }
            },
            ValidationDetail: {
                type: 'object',
                properties: {
                    type: { type: 'string', example: 'field' },
                    value: { type: 'string', nullable: true },
                    msg: { type: 'string', example: 'Username is required' },
                    path: { type: 'string', example: 'username' },
                    location: { type: 'string', example: 'body' }
                }
            },
            ValidationError: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    error: { type: 'string', example: 'Validation failed' },
                    details: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ValidationDetail' }
                    }
                }
            },
            HealthResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'E-Voting Backend is running' },
                    version: { type: 'string', example: '1.0.0' }
                }
            },
            LoginRequest: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                    username: {
                        type: 'string',
                        description: 'NIM mahasiswa atau username admin'
                    },
                    password: {
                        type: 'string',
                        minLength: 6
                    }
                }
            },
            LoginResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    token: { type: 'string' },
                    refreshToken: { type: 'string' },
                    role: { type: 'string', enum: ['admin', 'user'] },
                    username: { type: 'string' },
                    studentId: {
                        type: 'string',
                        description: 'Hanya ada untuk role user'
                    }
                }
            },
            RefreshTokenRequest: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                    refreshToken: { type: 'string' }
                }
            },
            RefreshTokenResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    token: { type: 'string' }
                }
            },
            AuthMeResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    role: { type: 'string', enum: ['admin', 'user'] },
                    username: { type: 'string' },
                    studentId: {
                        type: 'string',
                        description: 'Hanya ada untuk role user'
                    }
                }
            },
            ChangePasswordRequest: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                    currentPassword: { type: 'string', minLength: 1 },
                    newPassword: { type: 'string', minLength: 6 }
                }
            },
            ChangePasswordResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    message: {
                        type: 'string',
                        example: 'Password berhasil diperbarui'
                    }
                }
            },
            WalletBindChallengeRequest: {
                type: 'object',
                required: ['userAddress', 'studentId'],
                properties: {
                    userAddress: {
                        type: 'string',
                        description: 'Alamat Ethereum target yang akan di-bind'
                    },
                    studentId: {
                        type: 'string',
                        minLength: 3,
                        description: 'NIM mahasiswa yang sedang login'
                    }
                }
            },
            WalletBindChallengeResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    challengeToken: { type: 'string' },
                    message: {
                        type: 'string',
                        description: 'Pesan yang wajib ditandatangani oleh wallet'
                    },
                    expiresAt: {
                        type: 'string',
                        format: 'date-time'
                    }
                }
            },
            BindRequest: {
                type: 'object',
                required: ['userAddress', 'studentId', 'signature', 'challengeToken'],
                properties: {
                    userAddress: {
                        type: 'string',
                        description: 'Alamat Ethereum (0x...)'
                    },
                    studentId: {
                        type: 'string',
                        description: 'NIM mahasiswa'
                    },
                    signature: {
                        type: 'string',
                        description: 'Signature hasil penandatanganan challenge message'
                    },
                    challengeToken: {
                        type: 'string',
                        description: 'Token challenge dari endpoint /api/did/bind/challenge'
                    }
                }
            },
            BindResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    vc: {
                        type: 'object',
                        description: 'Verifiable Credential object'
                    },
                    vcJwt: {
                        type: 'string',
                        description: 'Signed VC dalam format JWT'
                    },
                    message: {
                        type: 'string',
                        example: 'Wallet bound successfully'
                    }
                }
            },
            DidStatusResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    claimed: { type: 'boolean' },
                    studentId: { type: 'string' },
                    nftClaimed: { type: 'boolean' },
                    txHash: {
                        type: 'string',
                        nullable: true
                    },
                    vc: {
                        type: 'object',
                        nullable: true
                    },
                    vcJwt: {
                        type: 'string',
                        nullable: true
                    }
                }
            },
            VerifyRegisterRequest: {
                type: 'object',
                required: ['userAddress', 'vcJwt'],
                properties: {
                    userAddress: { type: 'string' },
                    vcJwt: { type: 'string' }
                }
            },
            VerifyRegisterResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string' },
                    txHash: {
                        type: 'string',
                        nullable: true
                    },
                    nftTxHash: {
                        type: 'string',
                        nullable: true
                    }
                }
            },
            CreateUserRequest: {
                type: 'object',
                required: ['studentId', 'name', 'password'],
                properties: {
                    studentId: { type: 'string', minLength: 3 },
                    name: { type: 'string', minLength: 2, maxLength: 100 },
                    password: { type: 'string', minLength: 6 }
                }
            },
            CreateUserResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    message: {
                        type: 'string',
                        example: 'User created successfully'
                    },
                    student: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            studentId: { type: 'string' },
                            name: { type: 'string' },
                            active: { type: 'boolean' }
                        }
                    }
                }
            },
            UsersListResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    students: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                studentId: { type: 'string' },
                                name: { type: 'string' },
                                active: { type: 'boolean' },
                                claimedBy: { type: 'string', nullable: true }
                            }
                        }
                    }
                }
            },
            BulkImportResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    error: { type: 'string' },
                    summary: {
                        type: 'object',
                        properties: {
                            totalRows: { type: 'integer' },
                            created: { type: 'integer' },
                            failed: { type: 'integer' }
                        }
                    },
                    failed: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                line: { type: 'integer' },
                                studentId: { type: 'string', nullable: true },
                                reason: { type: 'string' }
                            }
                        }
                    }
                }
            },
            ResolveVoterAddressesRequest: {
                type: 'object',
                required: ['studentIds'],
                properties: {
                    studentIds: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 500,
                        items: { type: 'string' },
                        description: 'Array of student IDs (NIM)'
                    }
                }
            },
            ResolveVoterAddressesResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    resolved: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                studentId: { type: 'string' },
                                name: { type: 'string' },
                                address: { type: 'string' }
                            }
                        }
                    },
                    unresolved: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                studentId: { type: 'string' },
                                name: { type: 'string' },
                                reason: { type: 'string' }
                            }
                        }
                    }
                }
            },
            UploadResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    url: {
                        type: 'string',
                        description: 'URL file yang dapat memuat signed query params'
                    },
                    filename: { type: 'string' }
                }
            }
        }
    },
    tags: [
        { name: 'Health', description: 'Status server' },
        { name: 'Auth', description: 'Autentikasi dan token' },
        { name: 'DID', description: 'Digital Identity (bind wallet, VC, NFT)' },
        { name: 'Users', description: 'Manajemen user (Admin only)' },
        { name: 'Upload', description: 'Upload file (Admin only)' }
    ],
    paths: {
        '/': {
            get: {
                tags: ['Health'],
                summary: 'Health check',
                description: 'Memeriksa status server',
                responses: {
                    200: {
                        description: 'Server berjalan',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/HealthResponse' }
                            }
                        }
                    }
                }
            }
        },
        '/api/auth/login': {
            post: {
                tags: ['Auth'],
                summary: 'Login',
                description: 'Autentikasi user (admin/mahasiswa) dan dapatkan access token serta refresh token.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/LoginRequest' }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Login berhasil',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/LoginResponse' }
                            }
                        }
                    },
                    400: {
                        description: 'Validasi gagal',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationError' }
                            }
                        }
                    },
                    401: {
                        description: 'Kredensial invalid',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    403: {
                        description: 'Akun tidak aktif',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/api/auth/me': {
            get: {
                tags: ['Auth'],
                summary: 'Current user',
                description: 'Mengembalikan identitas user dari access token. Dipakai client untuk RBAC checks.',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: {
                        description: 'Informasi user saat ini',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/AuthMeResponse' }
                            }
                        }
                    },
                    401: {
                        description: 'Token tidak valid atau tidak ada',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/api/auth/refresh': {
            post: {
                tags: ['Auth'],
                summary: 'Refresh token',
                description: 'Perbarui access token menggunakan refresh token.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/RefreshTokenRequest' }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Token baru berhasil dibuat',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/RefreshTokenResponse' }
                            }
                        }
                    },
                    400: {
                        description: 'Validasi gagal',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationError' }
                            }
                        }
                    },
                    401: {
                        description: 'Refresh token invalid atau expired',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/api/auth/change-password': {
            put: {
                tags: ['Auth'],
                summary: 'Change password',
                description: 'Mengubah password akun yang sedang login.',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ChangePasswordRequest' }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Password berhasil diperbarui',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ChangePasswordResponse' }
                            }
                        }
                    },
                    400: {
                        description: 'Validasi gagal atau password baru sama dengan password lama',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    401: {
                        description: 'Token invalid atau password saat ini salah',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    404: {
                        description: 'User tidak ditemukan',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/api/did/bind/challenge': {
            post: {
                tags: ['DID'],
                summary: 'Create wallet bind challenge',
                description: 'Membuat challenge message jangka pendek yang wajib ditandatangani wallet. Hanya untuk role **user**.',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/WalletBindChallengeRequest' }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Challenge berhasil dibuat',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/WalletBindChallengeResponse' }
                            }
                        }
                    },
                    400: {
                        description: 'Payload tidak valid',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationError' }
                            }
                        }
                    },
                    401: {
                        description: 'Token tidak valid',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    403: {
                        description: 'Bukan mahasiswa atau studentId bukan milik sendiri',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/api/did/bind': {
            post: {
                tags: ['DID'],
                summary: 'Bind wallet',
                description: 'Ikat wallet ke NIM mahasiswa menggunakan challenge token dan signature, lalu terbitkan Verifiable Credential. Hanya role **user**.',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/BindRequest' }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Bind berhasil, VC diterbitkan',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/BindResponse' }
                            }
                        }
                    },
                    400: {
                        description: 'Validasi gagal, challenge tidak cocok, atau wallet/NIM sudah terikat',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    401: {
                        description: 'Token access invalid atau signature/challenge invalid',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    403: {
                        description: 'Bukan mahasiswa atau tidak berhak bind studentId tersebut',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    404: {
                        description: 'Mahasiswa tidak ditemukan atau inactive',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/api/did/status/{address}': {
            get: {
                tags: ['DID'],
                summary: 'Status binding wallet',
                description: 'Cek status binding wallet. User hanya bisa cek wallet miliknya sendiri jika address tersebut sudah terikat; admin bisa cek address apa pun.',
                security: [{ bearerAuth: [] }],
                parameters: [
                    {
                        name: 'address',
                        in: 'path',
                        required: true,
                        description: 'Alamat Ethereum yang ingin dicek',
                        schema: { type: 'string' }
                    }
                ],
                responses: {
                    200: {
                        description: 'Status binding berhasil didapatkan',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/DidStatusResponse' }
                            }
                        }
                    },
                    401: {
                        description: 'Token tidak valid',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    403: {
                        description: 'User mencoba mengecek wallet milik mahasiswa lain',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/api/did/verify-and-register': {
            post: {
                tags: ['DID'],
                summary: 'Verify VC and mint student NFT',
                description: 'Verifikasi VC dari proses bind wallet lalu mint NFT untuk mahasiswa. Hanya role **user**.',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/VerifyRegisterRequest' }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Permintaan mint berhasil diproses atau akun sudah terdaftar',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/VerifyRegisterResponse' }
                            }
                        }
                    },
                    400: {
                        description: 'VC invalid atau wallet belum ter-bind',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    403: {
                        description: 'VC tidak cocok dengan mahasiswa yang sedang login atau wallet ter-bind ke akun lain',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    404: {
                        description: 'Mahasiswa tidak ditemukan atau inactive',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    429: {
                        description: 'Mint sedang diproses untuk akun yang sama',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    500: {
                        description: 'Konfigurasi blockchain/server bermasalah atau transaksi gagal',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/api/users/create': {
            post: {
                tags: ['Users'],
                summary: 'Create student account',
                description: 'Daftarkan mahasiswa baru. Hanya **Admin**.',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/CreateUserRequest' }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'User berhasil dibuat',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CreateUserResponse' }
                            }
                        }
                    },
                    400: {
                        description: 'User sudah ada atau validasi gagal',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    401: {
                        description: 'Token tidak valid',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    403: {
                        description: 'Akses admin dibutuhkan',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/api/users/list': {
            get: {
                tags: ['Users'],
                summary: 'List students',
                description: 'Dapatkan daftar mahasiswa dengan filter query dan limit. Hanya **Admin**.',
                security: [{ bearerAuth: [] }],
                parameters: [
                    {
                        name: 'q',
                        in: 'query',
                        description: 'Pencarian berdasarkan NIM atau nama',
                        required: false,
                        schema: { type: 'string', maxLength: 100 }
                    },
                    {
                        name: 'limit',
                        in: 'query',
                        description: 'Batas jumlah data, 1-1000. Default 300.',
                        required: false,
                        schema: { type: 'integer', minimum: 1, maximum: 1000 }
                    }
                ],
                responses: {
                    200: {
                        description: 'Daftar mahasiswa berhasil didapatkan',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/UsersListResponse' }
                            }
                        }
                    },
                    400: {
                        description: 'Query parameter tidak valid',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationError' }
                            }
                        }
                    },
                    401: {
                        description: 'Token tidak valid',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    403: {
                        description: 'Akses admin dibutuhkan',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/api/users/bulk-import': {
            post: {
                tags: ['Users'],
                summary: 'Bulk import students (CSV/Excel)',
                description: 'Impor akun pemilih massal melalui file CSV, XLS, atau XLSX. Hanya **Admin**. Password default diatur di server dan tidak dikembalikan di response.',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                required: ['file'],
                                properties: {
                                    file: {
                                        type: 'string',
                                        format: 'binary',
                                        description: 'File spreadsheet (maks 5MB)'
                                    }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Import selesai',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/BulkImportResponse' }
                            }
                        }
                    },
                    400: {
                        description: 'File tidak valid, format tidak didukung, atau tidak ada data valid',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/BulkImportResponse' }
                            }
                        }
                    },
                    401: {
                        description: 'Token tidak valid',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    403: {
                        description: 'Akses admin dibutuhkan',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/api/users/resolve-voter-addresses': {
            post: {
                tags: ['Users'],
                summary: 'Resolve student IDs to wallet addresses',
                description: 'Memetakan NIM dengan wallet yang sudah ter-bind untuk dipakai pada allowlist sesi pemilihan. Hanya **Admin**.',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ResolveVoterAddressesRequest' }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Pemetaan alamat selesai',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ResolveVoterAddressesResponse' }
                            }
                        }
                    },
                    400: {
                        description: 'Payload tidak valid',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationError' }
                            }
                        }
                    },
                    401: {
                        description: 'Token tidak valid',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    403: {
                        description: 'Akses admin dibutuhkan',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/api/upload': {
            post: {
                tags: ['Upload'],
                summary: 'Upload image',
                description: 'Upload file gambar untuk kebutuhan admin. Hanya **Admin**. Format yang diizinkan: JPEG, PNG, GIF, WebP. Maksimal 5MB.',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                required: ['image'],
                                properties: {
                                    image: {
                                        type: 'string',
                                        format: 'binary'
                                    }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Upload berhasil',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/UploadResponse' }
                            }
                        }
                    },
                    400: {
                        description: 'File tidak valid, ekstensi tidak diizinkan, atau ukuran melebihi batas',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    401: {
                        description: 'Token tidak valid',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    403: {
                        description: 'Akses admin dibutuhkan',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    },
                    500: {
                        description: 'Gagal menyimpan berkas',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        }
    }
};

module.exports = swaggerDocument;
