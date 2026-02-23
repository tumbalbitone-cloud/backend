const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { ethers } = require('ethers');
const Student = require('../models/Student');
const { authMiddleware, userMiddleware } = require('../middleware/authMiddleware');
const { didLimiter } = require('../middleware/rateLimiter');
const { AppError } = require('../middleware/errorHandler');
const {
    createVerifiableCredential,
    signVerifiableCredential,
    verifyVerifiableCredential,
    isValidAddress,
    createDidFromAddress
} = require('../utils/vc');

/**
 * @route   POST /api/did/bind
 * @desc    Bind wallet to student ID and issue VC
 * @access  Private (student only; token + role user required)
 */
router.post('/bind', didLimiter, authMiddleware, userMiddleware, [
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

        // Verify that the authenticated user owns this studentId
        if (req.user.role === 'user' && req.user.studentId !== studentId) {
            throw new AppError('You can only bind wallet to your own student ID', 403);
        }

        // Force lowercase for address to prevent multiple bindings with different casing
        userAddress = ethers.getAddress(userAddress); // Normalize address

        // Check if student exists
        const student = await Student.findOne({ studentId });
        if (!student || !student.active) {
            throw new AppError('Student not found or inactive', 404);
        }

        // Check if ID is already claimed
        if (student.claimedBy && student.claimedBy.toLowerCase() !== userAddress.toLowerCase()) {
            throw new AppError('Student ID already bound to another wallet', 400);
        }

        // Check if Address already claimed ANY ID
        const existingClaim = await Student.findOne({
            claimedBy: { $regex: new RegExp(`^${userAddress}$`, 'i') }
        });
        if (existingClaim && existingClaim.studentId !== studentId) {
            throw new AppError(`Wallet already bound to Student ID: ${existingClaim.studentId}`, 400);
        }

        // Lock the claim
        student.claimedBy = userAddress;
        await student.save();

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
            claimedBy: { $regex: new RegExp(`^${normalizedAddress}$`, 'i') }
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
    userMiddleware,
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

            const { userAddress, vcJwt } = req.body;

            // Verify VC JWT
            const verificationResult = await verifyVerifiableCredential(vcJwt);

            if (!verificationResult.valid) {
                throw new AppError(`Invalid VC: ${verificationResult.error}`, 401);
            }

            const vc = verificationResult.vc;
            const expectedDid = createDidFromAddress(userAddress);

            // Verify VC belongs to this address
            if (vc.credentialSubject.id !== expectedDid) {
                throw new AppError('VC does not belong to this address', 400);
            }

            // Verify studentId matches authenticated user (if user role)
            if (req.user.role === 'user' && req.user.studentId !== vc.credentialSubject.studentId) {
                throw new AppError('VC does not match your student ID', 403);
            }

            const studentId = vc.credentialSubject.studentId;

            // Call Blockchain to Register Voter (NOW ONLY MINT NFT)
            const VotingSystemArtifact = require('../contracts/VotingSystem.json');

            const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545");
            // Use Admin Wallet (Owner)
            const privateKey = process.env.ADMIN_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
            const wallet = new ethers.Wallet(privateKey, provider);

            // We only need NFT contract now (VotingSystem handles NFT)
            const nftContract = new ethers.Contract(process.env.VOTING_SYSTEM_ADDRESS, VotingSystemArtifact.abi, wallet);

            // 1. Mint NFT
            // Check if already has NFT to avoid waste/error (Optional but recommended)
            try {
                const balance = await nftContract.balanceOf(userAddress);
                if (balance > 0) {
                    console.log(`User ${userAddress} already has NFT. Skipping mint.`);
                    return res.json({
                        success: true,
                        message: "Already Registered (NFT Owned)",
                        txHash: null,
                        nftTxHash: null // Already has it
                    });
                }
            } catch (e) {
                console.log("Error checking balance, proceeding to mint anyway:", e.message);
            }

            console.log(`Minting StudentNFT for ${userAddress} with ID ${studentId}...`);

            // Force refresh nonce to avoid "Nonce too low" issues
            const nonce = await wallet.getNonce();

            let nftTxHash = null;
            try {
                const txNft = await nftContract.mint(userAddress, studentId, { nonce });
                console.log("Minting tx sent:", txNft.hash);
                await txNft.wait();
                nftTxHash = txNft.hash;
                console.log(`[ON-CHAIN] Minted NFT for: ${userAddress}`);
            } catch (err) {
                console.error("Minting failed:", err);
                throw new AppError(`Minting failed: ${err.message}`, 500);
            }

            res.json({
                success: true,
                message: "NFT Minted Successfully",
                txHash: nftTxHash, // For frontend compatibility, use NFT hash
                nftTxHash: nftTxHash
            });
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
