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
- **admin**: Akses penuh (manajemen user, upload, dashboard)
- **user**: Mahasiswa (bind wallet, claim NFT, vote)
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
                        error: { type: 'string' }
                    }
                },
                ValidationError: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: { type: 'string', example: 'Validation failed' },
                        details: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    msg: { type: 'string' },
                                    path: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                LoginRequest: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: {
                        username: { type: 'string', description: 'NIM atau username admin' },
                        password: { type: 'string', minLength: 6 }
                    }
                },
                LoginResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        token: { type: 'string' },
                        refreshToken: { type: 'string' },
                        role: { type: 'string', enum: ['admin', 'user'] },
                        username: { type: 'string' },
                        studentId: { type: 'string', description: 'Hanya untuk role user' }
                    }
                },
                BindRequest: {
                    type: 'object',
                    required: ['userAddress', 'studentId'],
                    properties: {
                        userAddress: { type: 'string', description: 'Alamat Ethereum (0x...)' },
                        studentId: { type: 'string', description: 'NIM mahasiswa' }
                    }
                },
                BindResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        vc: { type: 'object' },
                        vcJwt: { type: 'string' },
                        message: { type: 'string' }
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
                CreateUserRequest: {
                    type: 'object',
                    required: ['studentId', 'name', 'password'],
                    properties: {
                        studentId: { type: 'string', minLength: 3 },
                        name: { type: 'string', minLength: 2, maxLength: 100 },
                        password: { type: 'string', minLength: 6 }
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
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            message: { type: 'string' }
                                        }
                                    }
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
                    description: 'Autentikasi user (Admin/Mahasiswa) dan dapatkan JWT',
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
                        400: { description: 'Validasi gagal' },
                        401: { description: 'Kredensial invalid' }
                    }
                }
            },
            '/api/auth/refresh': {
                post: {
                    tags: ['Auth'],
                    summary: 'Refresh token',
                    description: 'Perbarui access token menggunakan refresh token',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['refreshToken'],
                                    properties: {
                                        refreshToken: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: {
                            description: 'Token baru',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            token: { type: 'string' }
                                        }
                                    }
                                }
                            }
                        },
                        401: { description: 'Refresh token invalid atau expired' }
                    }
                }
            },
            '/api/did/bind': {
                post: {
                    tags: ['DID'],
                    summary: 'Bind wallet',
                    description: 'Ikat wallet MetaMask ke NIM mahasiswa dan terbitkan Verifiable Credential. Hanya role **user** (mahasiswa).',
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
                        400: { description: 'Wallet/NIM sudah terikat' },
                        403: { description: 'Bukan mahasiswa atau tidak berhak' },
                        401: { description: 'Token tidak valid' }
                    }
                }
            },
            '/api/did/status/{address}': {
                get: {
                    tags: ['DID'],
                    summary: 'Status binding wallet',
                    description: 'Cek status ikatan wallet. User hanya bisa cek milik sendiri; Admin bisa cek semua.',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        {
                            name: 'address',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' }
                        }
                    ],
                    responses: {
                        200: {
                            description: 'Status binding',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            claimed: { type: 'boolean' },
                                            studentId: { type: 'string' },
                                            nftClaimed: { type: 'boolean' },
                                            vc: { type: 'object' },
                                            vcJwt: { type: 'string' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/api/did/verify-and-register': {
                post: {
                    tags: ['DID'],
                    summary: 'Verify VC & mint Student NFT',
                    description: 'Verifikasi VC dari bind wallet lalu mint Soulbound NFT ke blockchain. Hanya role **user**.',
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
                            description: 'NFT berhasil di-mint',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            message: { type: 'string' },
                                            nftTxHash: { type: 'string' }
                                        }
                                    }
                                }
                            }
                        },
                        401: { description: 'VC invalid' },
                        500: { description: 'Gagal mint ke blockchain' }
                    }
                }
            },
            '/api/users/create': {
                post: {
                    tags: ['Users'],
                    summary: 'Buat akun pemilih baru',
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
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            message: { type: 'string' },
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
                                    }
                                }
                            }
                        },
                        400: { description: 'User sudah ada / validasi gagal' }
                    }
                }
            },
            '/api/upload': {
                post: {
                    tags: ['Upload'],
                    summary: 'Upload gambar',
                    description: 'Upload file gambar (foto kandidat). Hanya **Admin**. Max 5MB.',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'multipart/form-data': {
                                schema: {
                                    type: 'object',
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
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            url: { type: 'string' },
                                            filename: { type: 'string' }
                                        }
                                    }
                                }
                            }
                        },
                        400: { description: 'Bukan file gambar' }
                    }
                }
            }
        }
};

module.exports = swaggerDocument;
