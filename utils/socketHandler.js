const { Server } = require("socket.io");
const { createCorsPolicy } = require("../config/corsPolicy");
const { verifyToken } = require("./jwt");
const { invalidateReadModel } = require("./blockchainReadModel");
const { getEventContract, getEventProvider, getContractAddress } = require("./blockchainClient");

let io;
let pollingIntervalId = null;

/**
 * Optional JWT on handshake — used for join_admin; anonymous allowed for join_session.
 */
const socketAuthMiddleware = (socket, next) => {
    let raw = socket.handshake.auth?.token;

    if (!raw && socket.request.headers.cookie) {
        const cookies = socket.request.headers.cookie.split(';');
        for (const cookie of cookies) {
            const [key, value] = cookie.trim().split('=');
            if (key === 'token') {
                raw = value;
                break;
            }
        }
    }

    if (!raw || typeof raw !== "string") {
        socket.user = null;
        return next();
    }
    try {
        socket.user = verifyToken(raw);
        return next();
    } catch {
        socket.user = null;
        return next();
    }
};

/**
 * @param {import('http').Server} server
 * @param {{ cors?: object }} [options] - Prefer `socketIoCors` from createCorsPolicy (same rules as Express)
 */
const initializeSocket = (server, options = {}) => {
    const port = process.env.PORT || 3001;
    const cors = options.cors ?? createCorsPolicy(port).socketIoCors;
    io = new Server(server, { cors });

    io.use(socketAuthMiddleware);

    io.on("connection", (socket) => {
        socket.on("join_session", (sessionId) => {
            const n = Number(sessionId);
            if (!Number.isFinite(n) || n < 0) return;
            socket.join(`session:${n}`);
        });
        socket.on("join_admin", () => {
            if (socket.user?.role === "admin") {
                socket.join("admin");
            }
        });
        socket.on("disconnect", () => {});
    });

    setupContractListener().catch((err) => {
        console.error("❌ Contract listener failed to start:", err.message || err);
    });
    return io;
};

const emittedEvents = new Set();
const EMITTED_TTL = 120000;

const runDeduped = (eventId, emitFn) => {
    if (emittedEvents.has(eventId)) return;
    emittedEvents.add(eventId);
    emitFn();
    setTimeout(() => emittedEvents.delete(eventId), EMITTED_TTL);
};

/** vote_update: no voter address (privacy). Only clients in session room receive. */
const emitVoteUpdate = (eventId, sessionId, candidateId) => {
    const sid = Number(sessionId);
    runDeduped(eventId, () => {
        if (!io) return;
        invalidateReadModel({ sessionId: sid });
        const payload = {
            sessionId: String(sessionId),
            candidateId: String(candidateId),
            timestamp: new Date().toISOString()
        };
        io.to(`session:${sid}`).emit("vote_update", payload);
    });
};

const emitSessionScoped = (eventId, eventName, sessionId, payload) => {
    const sid = Number(sessionId);
    runDeduped(eventId, () => {
        if (!io) return;
        invalidateReadModel({ sessionId: sid, sessions: true });
        io.to(`session:${sid}`).to("admin").emit(eventName, payload);
    });
};

const emitSessionOnly = (eventId, eventName, sessionId, payload) => {
    const sid = Number(sessionId);
    runDeduped(eventId, () => {
        if (!io) return;
        invalidateReadModel({ sessionId: sid });
        io.to(`session:${sid}`).emit(eventName, payload);
    });
};

const emitGlobal = (eventId, eventName, payload) => {
    runDeduped(eventId, () => {
        if (!io) return;
        invalidateReadModel({ sessions: true });
        io.emit(eventName, payload);
    });
};

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
                            emitVoteUpdate(eventId, sessionId, candidateId);
                            break;
                        }
                        case "SessionStatusChanged": {
                            const [sessionId, isActive] = Array.isArray(args) ? args : [args.sessionId, args.isActive];
                            console.log(`🔔 [Poll] SessionStatusChanged - Session ${sessionId}`);
                            emitSessionScoped(eventId, "session_update", sessionId, {
                                sessionId: sessionId.toString(),
                                isActive
                            });
                            break;
                        }
                        case "SessionCreated": {
                            const [sessionId, _name, startTime, endTime] = Array.isArray(args) ? args : [args.sessionId, args.name, args.startTime, args.endTime];
                            console.log(`🔔 [Poll] SessionCreated - ${_name}`);
                            emitGlobal(eventId, "session_created", {
                                sessionId: sessionId.toString(),
                                name: _name,
                                startTime: startTime.toString(),
                                endTime: endTime.toString()
                            });
                            break;
                        }
                        case "CandidateAdded": {
                            const [sessionId, candidateId, _candName] = Array.isArray(args) ? args : [args.sessionId, args.candidateId, args.name];
                            console.log(`🔔 [Poll] CandidateAdded - Session ${sessionId}, ${_candName}`);
                            emitSessionOnly(eventId, "candidate_added", sessionId, {
                                sessionId: sessionId.toString(),
                                candidateId: candidateId.toString(),
                                name: _candName,
                            });
                            break;
                        }
                    }
                } catch (parseErr) {
                    // skip
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
        const provider = getEventProvider();
        const isWs = provider.constructor.name === "WebSocketProvider";
        if (isWs) {
            console.log("✅ Menggunakan WebSocket provider untuk event real-time");
        } else {
            console.log("✅ Menggunakan HTTP provider (JsonRpcProvider)");
        }

        const contractAddress = getContractAddress();
        if (!contractAddress) {
            console.error("❌ VOTING_SYSTEM_ADDRESS not set in .env, skipping contract listener.");
            return;
        }

        const contract = getEventContract();

        console.log(`✅ Listening for Blockchain events on: ${contractAddress}`);

        const handleVoted = (sessionId, voter, candidateId, event) => {
            const eventId = event?.log?.blockNumber && event?.log?.transactionHash
                ? `${event.log.blockNumber}-${event.log.transactionHash}-${event.log.index}`
                : `${Date.now()}-${voter}-${candidateId}`;
            console.log(`🔔 Blockchain Event: Voted - Session ${sessionId}, Candidate ${candidateId}`);
            emitVoteUpdate(eventId, sessionId, candidateId);
        };

        const handleSessionStatusChanged = (sessionId, isActive, event) => {
            const eventId = event?.log ? `${event.log.blockNumber}-${event.log.transactionHash}-${event.log.index}` : `session-${sessionId}-${Date.now()}`;
            console.log(`🔔 Blockchain Event: SessionStatusChanged - Session ${sessionId} is now ${isActive ? "Active" : "Closed"}`);
            emitSessionScoped(eventId, "session_update", sessionId, { sessionId: sessionId.toString(), isActive });
        };

        const handleSessionCreated = (sessionId, name, startTime, endTime, event) => {
            const eventId = event?.log ? `${event.log.blockNumber}-${event.log.transactionHash}-${event.log.index}` : `create-${sessionId}-${Date.now()}`;
            console.log(`🔔 Blockchain Event: SessionCreated - ${name}`);
            emitGlobal(eventId, "session_created", {
                sessionId: sessionId.toString(),
                name,
                startTime: startTime.toString(),
                endTime: endTime.toString()
            });
        };

        const handleCandidateAdded = (sessionId, candidateId, name, event) => {
            const eventId = event?.log ? `${event.log.blockNumber}-${event.log.transactionHash}-${event.log.index}` : `candidate-${sessionId}-${candidateId}-${Date.now()}`;
            console.log(`🔔 Blockchain Event: CandidateAdded - Session ${sessionId}, Candidate ${name}`);
            emitSessionOnly(eventId, "candidate_added", sessionId, {
                sessionId: sessionId.toString(),
                candidateId: candidateId.toString(),
                name,
            });
        };

        contract.on("Voted", handleVoted);
        contract.on("SessionStatusChanged", handleSessionStatusChanged);
        contract.on("SessionCreated", handleSessionCreated);
        contract.on("CandidateAdded", handleCandidateAdded);

        const usePolling = !isWs || process.env.EVENT_POLL_BACKUP === "true";
        if (usePolling) {
            await setupPollingFallback(contract);
        }

        process.on("SIGTERM", () => {
            if (pollingIntervalId) clearInterval(pollingIntervalId);
        });
    } catch (error) {
        console.error("❌ Error setting up contract listener:", error);
    }
};

module.exports = { initializeSocket };
