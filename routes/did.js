const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { ethers } = require('ethers');
const Student = require('../models/Student');
const { authMiddleware, studentOnlyMiddleware } = require('../middleware/authMiddleware');
const { didLimiter } = require('../middleware/rateLimiter');
const { AppError } = require('../middleware/errorHandler');
const {
    createVerifiableCredential,
    signVerifiableCredential,
    verifyVerifiableCredential,
    isValidAddress,
    createDidFromAddress
} = require('../utils/vc');

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
        .withMessage('Student ID must be alphanumeric')
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

        let { userAddress, studentId } = req.body;

        if (req.user.studentId !== studentId) {
            throw new AppError('You can only bind wallet to your own student ID', 403);
        }

        // Force lowercase for address to prevent multiple bindings with different casing
        userAddress = ethers.getAddress(userAddress); // Normalize address

        const normalizedAddress = userAddress.toLowerCase();

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
                // Check NFT balance
                const VotingSystemArtifact = require('../contracts/VotingSystem.json');
                const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545");
                const nftContract = new ethers.Contract(process.env.VOTING_SYSTEM_ADDRESS, VotingSystemArtifact.abi, provider);

                // Get balance strictly for this address
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

            // Call Blockchain to Register Voter (NOW ONLY MINT NFT)
            const VotingSystemArtifact = require('../contracts/VotingSystem.json');

            const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545");
            const privateKey = process.env.ADMIN_PRIVATE_KEY && String(process.env.ADMIN_PRIVATE_KEY).trim();
            if (!privateKey) {
                await clearMintLock();
                throw new AppError('ADMIN_PRIVATE_KEY is not configured', 500);
            }
            const wallet = new ethers.Wallet(privateKey, provider);

            const nftContract = new ethers.Contract(process.env.VOTING_SYSTEM_ADDRESS, VotingSystemArtifact.abi, wallet);

            try {
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
