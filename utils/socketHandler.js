const { Server } = require("socket.io");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

let io;

// Same whitelist as server.js - CORS_ORIGINS or FRONTEND_URL
const getCorsOrigins = () => {
    if (process.env.CORS_ORIGINS) {
        return process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [process.env.FRONTEND_URL || "http://localhost:3000"];
};

const initializeSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: getCorsOrigins(),
            methods: ["GET", "POST", "OPTIONS"],
            credentials: true
        }
    });

    io.on("connection", (socket) => {
        console.log("New User connected via Socket.io:", socket.id);

        socket.on("disconnect", () => {
            console.log("User disconnected:", socket.id);
        });
    });

    setupContractListener();
    return io;
};

const setupContractListener = async () => {
    try {
        const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545";
        // Use a polling provider or WebSocket provider if available, but JsonRpcProvider works for basic events usually
        // For local hardhat node, JsonRpcProvider is fine.
        const provider = new ethers.JsonRpcProvider(rpcUrl);

        const contractAddress = process.env.VOTING_SYSTEM_ADDRESS;
        if (!contractAddress) {
            console.error("❌ VOTING_SYSTEM_ADDRESS not set in .env, skipping contract listener.");
            return;
        }

        // Load ABI
        const abiPath = path.join(__dirname, "../contracts/VotingSystem.json");
        if (!fs.existsSync(abiPath)) {
            console.error("❌ VotingSystem.json not found at:", abiPath);
            return;
        }

        const fileContent = fs.readFileSync(abiPath, "utf8");
        const contractArtifact = JSON.parse(fileContent);

        if (!contractArtifact.abi) {
            console.error("❌ Invalid ABI file format.");
            return;
        }

        const contract = new ethers.Contract(contractAddress, contractArtifact.abi, provider);

        console.log(`✅ Listening for Blockchain events on: ${contractAddress}`);

        // Listen for Voted events
        // Event Voted(uint256 indexed sessionId, address indexed voter, uint256 indexed candidateId)
        contract.on("Voted", (sessionId, voter, candidateId, event) => {
            console.log(`🔔 Blockchain Event: Voted - Session ${sessionId}, Candidate ${candidateId}`);

            // Emit update to all clients
            if (io) {
                io.emit("vote_update", {
                    sessionId: sessionId.toString(),
                    candidateId: candidateId.toString(),
                    voter: voter,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Listen for SessionStatusChanged
        contract.on("SessionStatusChanged", (sessionId, isActive) => {
            console.log(`🔔 Blockchain Event: SessionStatusChanged - Session ${sessionId} is now ${isActive ? 'Active' : 'Closed'}`);
            if (io) {
                io.emit("session_update", {
                    sessionId: sessionId.toString(),
                    isActive
                });
            }
        });

        // Listen for SessionCreated
        contract.on("SessionCreated", (sessionId, name, startTime, endTime) => {
            console.log(`🔔 Blockchain Event: SessionCreated - ${name}`);
            if (io) {
                io.emit("session_created", {
                    sessionId: sessionId.toString(),
                    name,
                    startTime: startTime.toString(),
                    endTime: endTime.toString()
                });
            }
        });

        // Listen for CandidateAdded
        contract.on("CandidateAdded", (sessionId, candidateId, name, photoUrl) => {
            console.log(`🔔 Blockchain Event: CandidateAdded - Session ${sessionId}, Candidate ${name}`);
            if (io) {
                io.emit("candidate_added", {
                    sessionId: sessionId.toString(),
                    candidateId: candidateId.toString(),
                    name,
                    photoUrl
                });
            }
        });

    } catch (error) {
        console.error("❌ Error setting up contract listener:", error);
    }
};

module.exports = { initializeSocket };
