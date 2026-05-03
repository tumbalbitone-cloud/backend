const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { ethers } = require('ethers');
const Student = require('../models/Student');
const { authMiddleware, adminMiddleware, studentOnlyMiddleware } = require('../middleware/authMiddleware');
const { didLimiter } = require('../middleware/rateLimiter');
const { AppError } = require('../middleware/errorHandler');
const {
    createVerifiableCredential,
    signVerifiableCredential,
    verifyVerifiableCredential,
    isValidAddress,
    createDidFromAddress
} = require('../utils/vc');
const {
    createWalletBindChallenge,
    verifyWalletBindChallenge,
} = require('../utils/walletBindChallenge');
const {
    getReadContract,
    getWriteContract,
    getWriteSigner,
} = require('../utils/blockchainClient');

// Helper to prevent hanging Promises
const withTimeout = (promise, ms, message) => {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message || 'Operation timed out')), ms);
    });
    return Promise.race([
        promise,
        timeoutPromise
    ]).finally(() => clearTimeout(timer));
};

const getAdminBindSubject = (user) => `admin:${user.username || user.id}`;

const sendValidationErrorResponse = (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array()
        });
        return true;
    }
    return false;
};

const walletAddressValidator = () =>
    body('userAddress')
        .notEmpty()
        .withMessage('Wallet address is required')
        .custom((value) => {
            if (!isValidAddress(value)) {
                throw new Error('Invalid Ethereum address format');
            }
            return true;
        });

const getAdminRoleState = async (address) => {
    const contract = getReadContract();
    const ADMIN_ROLE = await contract.ADMIN_ROLE();
    return contract.hasRole(ADMIN_ROLE, address);
};

const ensureAdminRole = async (address) => {
    try {
        const contract = getWriteContract();
        const ADMIN_ROLE = await contract.ADMIN_ROLE();
        const hasRole = await contract.hasRole(ADMIN_ROLE, address);
        if (hasRole) {
            return false;
        }

        const tx = await contract.grantRole(ADMIN_ROLE, address);
        await tx.wait();
        return true;
    } catch (error) {
        console.error('Failed to grant ADMIN_ROLE on blockchain:', error);
        throw new AppError('Gagal memberikan ADMIN_ROLE ke wallet admin. Pastikan node blockchain berjalan dan ADMIN_PRIVATE_KEY memiliki hak DEFAULT_ADMIN_ROLE.', 500);
    }
};

/**
 * @route   POST /api/did/admin-wallet/challenge
 * @desc    Create a wallet binding challenge for the authenticated admin
 * @access  Admin only
 */
router.post('/admin-wallet/challenge', didLimiter, authMiddleware, adminMiddleware, [
    walletAddressValidator()
], async (req, res, next) => {
    try {
        if (sendValidationErrorResponse(req, res)) return;

        const userAddress = ethers.getAddress(req.body.userAddress);
        const challenge = createWalletBindChallenge({
            studentId: getAdminBindSubject(req.user),
            address: userAddress,
        });

        return res.json({
            success: true,
            challengeToken: challenge.challengeToken,
            message: challenge.message,
            expiresAt: challenge.expiresAt,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * @route   GET /api/did/admin-wallet/status/:address
 * @desc    Check whether an admin wallet can be used by the authenticated admin
 * @access  Admin only
 */
router.get('/admin-wallet/status/:address', authMiddleware, adminMiddleware, [
    param('address')
        .notEmpty()
        .withMessage('Address parameter is required')
        .custom((value) => {
            if (!isValidAddress(value)) {
                throw new Error('Invalid Ethereum address format');
            }
            return true;
        })
], async (req, res, next) => {
    try {
        if (sendValidationErrorResponse(req, res)) return;

        const normalizedAddress = ethers.getAddress(req.params.address);
        const normalizedAddressKey = normalizedAddress.toLowerCase();
        const admin = await Student.findOne({ _id: req.user.id, role: 'admin' }, 'claimedBy claimedByNormalized active');
        if (!admin || !admin.active) {
            throw new AppError('Admin not found or inactive', 404);
        }

        const existingOwner = await Student.findOne(
            {
                _id: { $ne: req.user.id },
                $or: [
                    { claimedByNormalized: normalizedAddressKey },
                    { claimedBy: { $regex: new RegExp(`^${normalizedAddress}$`, 'i') } }
                ]
            },
            'username studentId role'
        );
        if (existingOwner) {
            return res.status(409).json({
                success: false,
                error: 'Wallet already bound to another account'
            });
        }

        const boundAddress = admin.claimedByNormalized || String(admin.claimedBy || '').toLowerCase();
        if (!boundAddress) {
            return res.json({
                success: true,
                bound: false,
                matches: false
            });
        }

        if (boundAddress !== normalizedAddressKey) {
            return res.status(409).json({
                success: false,
                error: 'Admin account already bound to another wallet',
                bound: true,
                matches: false,
                address: admin.claimedBy
            });
        }

        return res.json({
            success: true,
            bound: true,
            matches: true,
            address: admin.claimedBy,
            adminRoleGranted: await getAdminRoleState(normalizedAddress)
        });
    } catch (err) {
        next(err);
    }
});

/**
 * @route   POST /api/did/admin-wallet/bind
 * @desc    Bind exactly one wallet address to the authenticated admin account
 * @access  Admin only
 */
router.post('/admin-wallet/bind', didLimiter, authMiddleware, adminMiddleware, [
    walletAddressValidator(),
    body('signature')
        .trim()
        .notEmpty()
        .withMessage('Wallet signature is required'),
    body('challengeToken')
        .trim()
        .notEmpty()
        .withMessage('Wallet bind challenge token is required')
], async (req, res, next) => {
    try {
        if (sendValidationErrorResponse(req, res)) return;

        const userAddress = ethers.getAddress(req.body.userAddress);
        const normalizedAddress = userAddress.toLowerCase();
        const challenge = verifyWalletBindChallenge(req.body.challengeToken);

        if (challenge.studentId !== getAdminBindSubject(req.user)) {
            throw new AppError('Wallet bind challenge does not match this admin account', 400);
        }

        if (challenge.address !== normalizedAddress) {
            throw new AppError('Wallet bind challenge does not match this wallet address', 400);
        }

        const recoveredAddress = ethers.verifyMessage(challenge.message, req.body.signature).toLowerCase();
        if (recoveredAddress !== normalizedAddress) {
            throw new AppError('Wallet signature is invalid for this address', 401);
        }

        const admin = await Student.findOneAndUpdate(
            {
                _id: req.user.id,
                role: 'admin',
                active: true,
                $or: [
                    { claimedBy: null },
                    { claimedBy: { $exists: false } },
                    { claimedBy: { $regex: new RegExp(`^${userAddress}$`, 'i') } },
                    { claimedByNormalized: normalizedAddress }
                ]
            },
            {
                $set: {
                    claimedBy: userAddress,
                    claimedByNormalized: normalizedAddress
                }
            },
            { new: true }
        );

        if (!admin) {
            const existingAdmin = await Student.findOne({ _id: req.user.id, role: 'admin' }, 'claimedBy active');
            if (!existingAdmin || !existingAdmin.active) {
                throw new AppError('Admin not found or inactive', 404);
            }
            if (existingAdmin.claimedBy && existingAdmin.claimedBy.toLowerCase() !== normalizedAddress) {
                throw new AppError('Admin account already bound to another wallet', 400);
            }
            throw new AppError('Failed to bind admin wallet', 400);
        }

        const roleGranted = await ensureAdminRole(userAddress);

        res.json({
            success: true,
            address: admin.claimedBy,
            adminRoleGranted: true,
            roleGranted,
            message: roleGranted
                ? 'Admin wallet bound and ADMIN_ROLE granted successfully'
                : 'Admin wallet bound successfully'
        });
    } catch (err) {
        if (err?.name === 'TokenExpiredError' || err?.name === 'JsonWebTokenError') {
            return next(new AppError('Wallet bind challenge is invalid or expired', 401));
        }
        if (err?.code === 11000) {
            return next(new AppError('Wallet already bound to another account', 400));
        }
        next(err);
    }
});

/**
 * @route   POST /api/did/bind/challenge
 * @desc    Create a short-lived message that must be signed by the target wallet
 * @access  Private (student only; token + role user required)
 */
router.post('/bind/challenge', didLimiter, authMiddleware, studentOnlyMiddleware, [
    body('userAddress')
        .notEmpty()
        .withMessage('Wallet address is required')
        .custom((value) => {
            if (!isValidAddress(value)) {
                throw new Error('Invalid Ethereum address format');
            }
            return true;
        }),
    body('studentId')
        .trim()
        .notEmpty()
        .withMessage('Student ID is required')
        .isLength({ min: 3 })
        .withMessage('Student ID must be at least 3 characters')
        .matches(/^[a-zA-Z0-9]+$/)
        .withMessage('Student ID must be alphanumeric')
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const studentId = String(req.body.studentId || '').trim();
        const userAddress = ethers.getAddress(req.body.userAddress);

        if (req.user.studentId !== studentId) {
            throw new AppError('You can only bind wallet to your own student ID', 403);
        }

        const challenge = createWalletBindChallenge({
            studentId,
            address: userAddress,
        });

        return res.json({
            success: true,
            challengeToken: challenge.challengeToken,
            message: challenge.message,
            expiresAt: challenge.expiresAt,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * @route   POST /api/did/bind
 * @desc    Bind wallet to student ID and issue VC
 * @access  Private (student only; token + role user required)
 */
router.post('/bind', didLimiter, authMiddleware, studentOnlyMiddleware, [
    body('userAddress')
        .notEmpty()
        .withMessage('Wallet address is required')
        .custom((value) => {
            if (!isValidAddress(value)) {
                throw new Error('Invalid Ethereum address format');
            }
            return true;
        }),
    body('studentId')
        .trim()
        .notEmpty()
        .withMessage('Student ID is required')
        .isLength({ min: 3 })
        .withMessage('Student ID must be at least 3 characters')
        .matches(/^[a-zA-Z0-9]+$/)
        .withMessage('Student ID must be alphanumeric'),
    body('signature')
        .trim()
        .notEmpty()
        .withMessage('Wallet signature is required'),
    body('challengeToken')
        .trim()
        .notEmpty()
        .withMessage('Wallet bind challenge token is required')
], async (req, res, next) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        let { userAddress, studentId, signature, challengeToken } = req.body;

        if (req.user.studentId !== studentId) {
            throw new AppError('You can only bind wallet to your own student ID', 403);
        }

        // Force lowercase for address to prevent multiple bindings with different casing
        userAddress = ethers.getAddress(userAddress); // Normalize address

        const normalizedAddress = userAddress.toLowerCase();
        const challenge = verifyWalletBindChallenge(challengeToken);

        if (challenge.studentId !== studentId) {
            throw new AppError('Wallet bind challenge does not match this student ID', 400);
        }

        if (challenge.address !== normalizedAddress) {
            throw new AppError('Wallet bind challenge does not match this wallet address', 400);
        }

        const recoveredAddress = ethers.verifyMessage(challenge.message, signature).toLowerCase();
        if (recoveredAddress !== normalizedAddress) {
            throw new AppError('Wallet signature is invalid for this address', 401);
        }

        // Atomic bind:
        // - only active student can be bound
        // - allow idempotent bind to same wallet
        // - forbid replacing with another wallet
        const student = await Student.findOneAndUpdate(
            {
                studentId,
                active: true,
                $or: [
                    { claimedBy: null },
                    { claimedByNormalized: normalizedAddress }
                ]
            },
            {
                $set: {
                    claimedBy: userAddress,
                    claimedByNormalized: normalizedAddress
                }
            },
            { new: true }
        );

        if (!student) {
            const existing = await Student.findOne({ studentId }, 'active claimedBy');
            if (!existing || !existing.active) {
                throw new AppError('Student not found or inactive', 404);
            }

            if (existing.claimedBy && existing.claimedBy.toLowerCase() !== normalizedAddress) {
                throw new AppError('Student ID already bound to another wallet', 400);
            }

            throw new AppError('Failed to bind wallet', 400);
        }

        // Create Verifiable Credential according to W3C standard
        const credentialSubject = {
            id: createDidFromAddress(userAddress),
            studentId: studentId,
            name: student.name,
            status: "active"
        };

        const vc = createVerifiableCredential(credentialSubject);

        // Sign the VC using did-jwt
        const vcJwt = await signVerifiableCredential(vc);

        res.json({
            success: true,
            vc: vc, // Return VC object for display
            vcJwt: vcJwt, // Return signed JWT
            message: "Wallet bound successfully"
        });
    } catch (err) {
        if (err?.name === 'TokenExpiredError' || err?.name === 'JsonWebTokenError') {
            return next(new AppError('Wallet bind challenge is invalid or expired', 401));
        }
        if (err?.code === 11000) {
            return next(new AppError('Wallet already bound to another student ID', 400));
        }
        next(err);
    }
});

/**
 * @route   GET /api/did/status/:address
 * @desc    Check wallet binding status
 * @access  Private: user can only check own binding (or unbound); admin can check any address
 */
router.get('/status/:address', authMiddleware, [
    param('address')
        .notEmpty()
        .withMessage('Address parameter is required')
        .custom((value) => {
            if (!isValidAddress(value)) {
                throw new Error('Invalid Ethereum address format');
            }
            return true;
        })
], async (req, res, next) => {
    try {
        const { address } = req.params;

        if (!isValidAddress(address)) {
            throw new AppError('Invalid Ethereum address format', 400);
        }

        const normalizedAddress = ethers.getAddress(address);
        const student = await Student.findOne({
            $or: [
                { claimedByNormalized: normalizedAddress.toLowerCase() },
                { claimedBy: { $regex: new RegExp(`^${normalizedAddress}$`, 'i') } }
            ]
        });

        // Non-admin users may only check status for an address bound to their own studentId (or unbound)
        if (req.user.role !== 'admin' && student && student.studentId !== req.user.studentId) {
            throw new AppError('You may only check binding status for your own wallet', 403);
        }

        if (student) {
            let nftClaimed = false;
            let vc = null;
            let vcJwt = null;

            try {
                const nftContract = getReadContract();
                const balance = await nftContract.balanceOf(normalizedAddress);
                if (balance > 0) {
                    nftClaimed = true;
                }
            } catch (e) {
                console.error("[Status Check] Error checking NFT balance:", e.message);
                // Proceed without crashing, assumption: not claimed or RPC error
            }

            // If bound but not claimed (or unable to verify), provide VC so user can try to claim
            if (!nftClaimed) {
                const credentialSubject = {
                    id: createDidFromAddress(normalizedAddress),
                    studentId: student.studentId,
                    name: student.name,
                    status: "active"
                };
                vc = createVerifiableCredential(credentialSubject);
                vcJwt = await signVerifiableCredential(vc);
            }

            return res.json({
                success: true,
                claimed: true,
                studentId: student.studentId,
                nftClaimed: nftClaimed,
                txHash: student.nftTxHash || null,
                vc: vc,
                vcJwt: vcJwt
            });
        } else {
            return res.json({
                success: true,
                claimed: false
            });
        }
    } catch (err) {
        next(err);
    }
});

/**
 * @route   POST /api/did/verify-and-register
 * @desc    Verify VC and register voter on blockchain
 * @access  Private (student only; token + role user required)
 */
router.post('/verify-and-register',
    didLimiter,
    authMiddleware,
    studentOnlyMiddleware,
    [
        body('userAddress')
            .notEmpty()
            .withMessage('Wallet address is required')
            .custom((value) => {
                if (!isValidAddress(value)) {
                    throw new Error('Invalid Ethereum address format');
                }
                return true;
            }),
        body('vcJwt')
            .notEmpty()
            .withMessage('Verifiable Credential JWT is required')
    ],
    async (req, res, next) => {
        try {
            // Check validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            let { userAddress, vcJwt } = req.body;
            // Normalize address early (consistent checks + contract calls)
            userAddress = ethers.getAddress(userAddress);

            // Verify VC JWT
            const verificationResult = await verifyVerifiableCredential(vcJwt);

            if (!verificationResult.valid) {
                throw new AppError(`Invalid VC: ${verificationResult.error}`, 400);
            }

            const vc = verificationResult.vc;
            const expectedDid = createDidFromAddress(userAddress);

            // Verify VC belongs to this address
            if (vc.credentialSubject.id !== expectedDid) {
                throw new AppError('VC does not belong to this address', 400);
            }

            if (req.user.studentId !== vc.credentialSubject.studentId) {
                throw new AppError('VC does not match your student ID', 403);
            }

            const studentId = vc.credentialSubject.studentId;

            let student = await Student.findOne({ studentId });
            if (!student || !student.active) {
                throw new AppError('Student not found or inactive', 404);
            }

            if (!student.claimedBy) {
                throw new AppError('Wallet is not bound to this student ID', 400);
            }

            const boundAddress = (student.claimedByNormalized || String(student.claimedBy || '').toLowerCase());
            if (boundAddress !== userAddress.toLowerCase()) {
                throw new AppError('Wallet does not match bound student account', 403);
            }

            // Serialize mint attempts per student (avoid duplicate concurrent mints)
            const locked = await Student.findOneAndUpdate(
                { studentId, active: true, nftMintInProgress: { $ne: true } },
                { $set: { nftMintInProgress: true } },
                { new: true }
            );

            if (!locked) {
                const s = await Student.findOne({ studentId });
                if (s?.nftTxHash) {
                    return res.json({
                        success: true,
                        message: 'Already Registered (NFT Owned)',
                        txHash: s.nftTxHash,
                        nftTxHash: s.nftTxHash
                    });
                }
                throw new AppError('Mint sedang diproses untuk akun ini. Coba lagi sebentar.', 429);
            }

            student = locked;

            const clearMintLock = () => Student.updateOne({ studentId }, { $set: { nftMintInProgress: false } });

            try {
                const wallet = getWriteSigner();
                const nftContract = getWriteContract();
                try {
                    const balance = await withTimeout(nftContract.balanceOf(userAddress), 10000, "balanceOf timeout");
                    if (balance > 0) {
                        console.log(`User ${userAddress} already has NFT. Skipping mint.`);
                        await clearMintLock();
                        return res.json({
                            success: true,
                            message: "Already Registered (NFT Owned)",
                            txHash: student?.nftTxHash || null,
                            nftTxHash: student?.nftTxHash || null
                        });
                    }
                } catch (e) {
                    console.log("Error checking balance, proceeding to mint anyway:", e.message);
                }

                console.log(`Minting StudentNFT for ${userAddress} with ID ${studentId}...`);

                const nonce = await withTimeout(wallet.getNonce(), 10000, "getNonce timeout");

                const txNft = await withTimeout(nftContract.mint(userAddress, studentId, { nonce }), 15000, "mint timeout");
                console.log("Minting tx sent:", txNft.hash);
                const nftTxHash = txNft.hash;

                student.nftTxHash = nftTxHash;
                student.nftMintInProgress = false;
                await student.save();

                txNft.wait()
                    .then(receipt => {
                        console.log(`[ON-CHAIN] Minted NFT for: ${userAddress} in block ${receipt.blockNumber}`);
                    })
                    .catch(err => {
                        console.error(`[ON-CHAIN] Minting confirmation failed for ${userAddress}:`, err);
                    });

                return res.json({
                    success: true,
                    message: "NFT Mint transaction submitted successfully",
                    txHash: nftTxHash,
                    nftTxHash: nftTxHash
                });
            } catch (err) {
                await clearMintLock();
                console.error("Minting failed:", err);
                if (err instanceof AppError) {
                    throw err;
                }
                throw new AppError(`Minting failed: ${err.message}`, 500);
            }
        } catch (err) {
            if (err instanceof AppError) {
                next(err);
            } else {
                console.error("Blockchain verification failed:", err);
                next(new AppError(`Blockchain transaction failed: ${err.message}`, 500));
            }
        }
    });

module.exports = router;
