const { Server } = require("socket.io");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

let io;
let pollingIntervalId = null;

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

/**
 * Emit event ke Socket.IO klien dengan deduplikasi
 */
const emittedEvents = new Set();
const EMITTED_TTL = 120000; // 2 menit, lalu hapus untuk hindari memory leak

const emitEvent = (eventId, eventName, payload) => {
    if (emittedEvents.has(eventId)) return;
    emittedEvents.add(eventId);
    if (io) io.emit(eventName, payload);
    // Cleanup TTL sederhana - hapus setelah delay
    setTimeout(() => emittedEvents.delete(eventId), EMITTED_TTL);
};

/**
 * Setup provider: WebSocket jika URL ws:// atau wss://, selain itu JsonRpcProvider
 */
const createProvider = () => {
    const rpcUrl = (process.env.BLOCKCHAIN_WS_URL || process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545").trim();
    if (rpcUrl.startsWith("ws://") || rpcUrl.startsWith("wss://")) {
        try {
            return new ethers.WebSocketProvider(rpcUrl);
        } catch (e) {
            console.warn("⚠️ WebSocket provider gagal, fallback ke HTTP:", e.message);
            const httpUrl = process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545";
            return new ethers.JsonRpcProvider(httpUrl);
        }
    }
    return new ethers.JsonRpcProvider(rpcUrl);
};

/**
 * Polling fallback: query event dari blockchain secara berkala
 * Penting untuk Hardhat node yang kadang tidak emit event via subscription
 */
const setupPollingFallback = async (contract) => {
    const pollIntervalMs = parseInt(process.env.EVENT_POLL_INTERVAL_MS, 10) || 5000;
    let lastBlock = 0;

    const poll = async () => {
        try {
            const currentBlock = await contract.runner.getBlockNumber();
            if (currentBlock <= lastBlock) return;

            const fromBlock = lastBlock === 0 ? Math.max(0, currentBlock - 100) : lastBlock + 1;
            lastBlock = currentBlock;

            const events = await contract.queryFilter("*", fromBlock, currentBlock);

            for (const log of events) {
                const eventId = `${log.blockNumber}-${log.transactionHash}-${log.index}`;
                try {
                    const name = log.fragment?.name || contract.interface.parseLog(log)?.fragment?.name;
                    const args = log.args ?? contract.interface.parseLog(log)?.args;
                    if (!name || !args) continue;

                    switch (name) {
                        case "Voted": {
                            const [sessionId, voter, candidateId] = Array.isArray(args) ? args : [args.sessionId, args.voter, args.candidateId];
                            console.log(`🔔 [Poll] Voted - Session ${sessionId}, Candidate ${candidateId}`);
                            emitEvent(eventId, "vote_update", {
                                sessionId: sessionId.toString(),
                                candidateId: candidateId.toString(),
                                voter,
                                timestamp: new Date().toISOString()
                            });
                            break;
                        }
                        case "SessionStatusChanged": {
                            const [sessionId, isActive] = Array.isArray(args) ? args : [args.sessionId, args.isActive];
                            console.log(`🔔 [Poll] SessionStatusChanged - Session ${sessionId}`);
                            emitEvent(eventId, "session_update", {
                                sessionId: sessionId.toString(),
                                isActive
                            });
                            break;
                        }
                        case "SessionCreated": {
                            const [sessionId, _name, startTime, endTime] = Array.isArray(args) ? args : [args.sessionId, args.name, args.startTime, args.endTime];
                            console.log(`🔔 [Poll] SessionCreated - ${_name}`);
                            emitEvent(eventId, "session_created", {
                                sessionId: sessionId.toString(),
                                name: _name,
                                startTime: startTime.toString(),
                                endTime: endTime.toString()
                            });
                            break;
                        }
                        case "CandidateAdded": {
                            const [sessionId, candidateId, _candName, photoUrl] = Array.isArray(args) ? args : [args.sessionId, args.candidateId, args.name, args.photoUrl];
                            console.log(`🔔 [Poll] CandidateAdded - Session ${sessionId}, ${_candName}`);
                            emitEvent(eventId, "candidate_added", {
                                sessionId: sessionId.toString(),
                                candidateId: candidateId.toString(),
                                name: _candName,
                                photoUrl
                            });
                            break;
                        }
                    }
                } catch (parseErr) {
                    // Bukan event dari kontrak kita, skip
                }
            }
        } catch (err) {
            console.error("❌ [Poll] Error:", err.message);
        }
    };

    pollingIntervalId = setInterval(poll, pollIntervalMs);
    await poll();
    console.log(`✅ Event polling aktif (setiap ${pollIntervalMs}ms)`);
};

const setupContractListener = async () => {
    try {
        const provider = createProvider();
        const isWs = provider.constructor.name === "WebSocketProvider";
        if (isWs) {
            console.log("✅ Menggunakan WebSocket provider untuk event real-time");
        } else {
            console.log("✅ Menggunakan HTTP provider (JsonRpcProvider)");
        }

        const contractAddress = process.env.VOTING_SYSTEM_ADDRESS;
        if (!contractAddress) {
            console.error("❌ VOTING_SYSTEM_ADDRESS not set in .env, skipping contract listener.");
            return;
        }

        const abiPath = path.join(__dirname, "../contracts/VotingSystem.json");
        if (!fs.existsSync(abiPath)) {
            console.error("❌ VotingSystem.json not found at:", abiPath);
            return;
        }

        const contractArtifact = JSON.parse(fs.readFileSync(abiPath, "utf8"));
        if (!contractArtifact.abi) {
            console.error("❌ Invalid ABI file format.");
            return;
        }

        const contract = new ethers.Contract(contractAddress, contractArtifact.abi, provider);

        console.log(`✅ Listening for Blockchain events on: ${contractAddress}`);

        // Event handler helper - gunakan event dari log untuk deduplikasi
        const handleVoted = (sessionId, voter, candidateId, event) => {
            const eventId = event?.log?.blockNumber && event?.log?.transactionHash
                ? `${event.log.blockNumber}-${event.log.transactionHash}-${event.log.index}`
                : `${Date.now()}-${voter}-${candidateId}`;
            console.log(`🔔 Blockchain Event: Voted - Session ${sessionId}, Candidate ${candidateId}`);
            emitEvent(eventId, "vote_update", {
                sessionId: sessionId.toString(),
                candidateId: candidateId.toString(),
                voter,
                timestamp: new Date().toISOString()
            });
        };

        const handleSessionStatusChanged = (sessionId, isActive, event) => {
            const eventId = event?.log ? `${event.log.blockNumber}-${event.log.transactionHash}-${event.log.index}` : `session-${sessionId}-${Date.now()}`;
            console.log(`🔔 Blockchain Event: SessionStatusChanged - Session ${sessionId} is now ${isActive ? "Active" : "Closed"}`);
            emitEvent(eventId, "session_update", { sessionId: sessionId.toString(), isActive });
        };

        const handleSessionCreated = (sessionId, name, startTime, endTime, event) => {
            const eventId = event?.log ? `${event.log.blockNumber}-${event.log.transactionHash}-${event.log.index}` : `create-${sessionId}-${Date.now()}`;
            console.log(`🔔 Blockchain Event: SessionCreated - ${name}`);
            emitEvent(eventId, "session_created", {
                sessionId: sessionId.toString(),
                name,
                startTime: startTime.toString(),
                endTime: endTime.toString()
            });
        };

        const handleCandidateAdded = (sessionId, candidateId, name, photoUrl, event) => {
            const eventId = event?.log ? `${event.log.blockNumber}-${event.log.transactionHash}-${event.log.index}` : `candidate-${sessionId}-${candidateId}-${Date.now()}`;
            console.log(`🔔 Blockchain Event: CandidateAdded - Session ${sessionId}, Candidate ${name}`);
            emitEvent(eventId, "candidate_added", {
                sessionId: sessionId.toString(),
                candidateId: candidateId.toString(),
                name,
                photoUrl
            });
        };

        contract.on("Voted", handleVoted);
        contract.on("SessionStatusChanged", handleSessionStatusChanged);
        contract.on("SessionCreated", handleSessionCreated);
        contract.on("CandidateAdded", handleCandidateAdded);

        // Polling fallback: selalu aktif untuk HTTP (Hardhat), opsional untuk WebSocket
        const usePolling = !isWs || process.env.EVENT_POLL_BACKUP === "true";
        if (usePolling) {
            await setupPollingFallback(contract);
        }

        // Cleanup polling on process exit
        process.on("SIGTERM", () => {
            if (pollingIntervalId) clearInterval(pollingIntervalId);
        });
    } catch (error) {
        console.error("❌ Error setting up contract listener:", error);
    }
};

module.exports = { initializeSocket };
