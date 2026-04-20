const { ethers } = require('ethers');
const { getReadProvider, getReadContract } = require('./blockchainClient');
const CandidateMetadata = require('../models/CandidateMetadata');

const DEFAULT_CACHE_TTL_MS = 5000;
const DEFAULT_EVENT_CHUNK_SIZE = 9000;

const sessionsCache = {
    value: null,
    expiresAt: 0,
    promise: null,
};

const sessionResultsCache = new Map();
const sessionStatsCache = new Map();
const sessionAllowlistCache = new Map();

const getCandidateMetadataMap = async (sessionId) => {
    const rows = await CandidateMetadata.find(
        { sessionId: Number(sessionId) },
        'candidateId name photoUrl vision mission'
    ).lean();

    return new Map(rows.map((row) => [
        Number(row.candidateId),
        {
            name: String(row.name || ''),
            photoUrl: String(row.photoUrl || ''),
            vision: String(row.vision || ''),
            mission: String(row.mission || ''),
        },
    ]));
};

const getCacheTtlMs = () => {
    const raw = Number.parseInt(process.env.READ_MODEL_CACHE_TTL_MS, 10);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CACHE_TTL_MS;
};

const getEventChunkSize = () => {
    const raw = Number.parseInt(process.env.READ_MODEL_EVENT_CHUNK_SIZE, 10);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_EVENT_CHUNK_SIZE;
};

const cacheEntryValid = (entry) => entry && entry.value != null && entry.expiresAt > Date.now();

const withMapCache = async (cacheMap, key, loader) => {
    const existing = cacheMap.get(key);
    if (cacheEntryValid(existing)) {
        return existing.value;
    }

    if (existing?.promise) {
        return existing.promise;
    }

    const promise = (async () => {
        try {
            const value = await loader();
            cacheMap.set(key, {
                value,
                expiresAt: Date.now() + getCacheTtlMs(),
                promise: null,
            });
            return value;
        } catch (error) {
            cacheMap.delete(key);
            throw error;
        }
    })();

    cacheMap.set(key, {
        value: existing?.value ?? null,
        expiresAt: existing?.expiresAt ?? 0,
        promise,
    });

    return promise;
};

const formatSession = (session) => ({
    id: Number(session.id),
    name: String(session.name),
    description: String(session.description),
    startTime: Number(session.startTime),
    endTime: Number(session.endTime),
    isActive: Boolean(session.isActive),
});

const getSessionsReadModel = async () => {
    if (cacheEntryValid(sessionsCache)) {
        return sessionsCache.value;
    }

    if (sessionsCache.promise) {
        return sessionsCache.promise;
    }

    sessionsCache.promise = (async () => {
        try {
            const contract = getReadContract();
            const data = await contract.getAllSessions();
            const sessions = data.map(formatSession).sort((a, b) => b.id - a.id);
            const payload = {
                sessions,
                updatedAt: new Date().toISOString(),
            };

            sessionsCache.value = payload;
            sessionsCache.expiresAt = Date.now() + getCacheTtlMs();
            sessionsCache.promise = null;
            return payload;
        } catch (error) {
            sessionsCache.promise = null;
            throw error;
        }
    })();

    return sessionsCache.promise;
};

const getSessionById = async (sessionId) => {
    const { sessions } = await getSessionsReadModel();
    return sessions.find((session) => session.id === Number(sessionId)) || null;
};

const ensureSessionExists = async (sessionId) => {
    const session = await getSessionById(sessionId);
    if (!session) {
        const error = new Error('Session not found');
        error.statusCode = 404;
        throw error;
    }
    return session;
};

const getSessionResultsReadModel = async (sessionId) => {
    const normalizedSessionId = Number(sessionId);
    return withMapCache(sessionResultsCache, normalizedSessionId, async () => {
        const contract = getReadContract();
        const session = await ensureSessionExists(normalizedSessionId);
        const data = await contract.getCandidates(normalizedSessionId);
        const metadataMap = await getCandidateMetadataMap(normalizedSessionId);

        let totalVotes = 0;
        const candidates = data.map((candidate) => {
            const voteCount = Number(candidate.voteCount);
            const candidateId = Number(candidate.id);
            const metadata = metadataMap.get(candidateId);
            totalVotes += voteCount;
            return {
                id: candidateId,
                name: metadata?.name || String(candidate.name || `Candidate #${candidateId}`),
                photoUrl: metadata?.photoUrl || '',
                vision: metadata?.vision || '',
                mission: metadata?.mission || '',
                voteCount,
            };
        });

        const candidatesWithStats = candidates
            .map((candidate) => ({
                ...candidate,
                percentage: totalVotes === 0
                    ? '0.0'
                    : ((candidate.voteCount / totalVotes) * 100).toFixed(1),
            }))
            .sort((a, b) => b.voteCount - a.voteCount || a.id - b.id);

        return {
            session,
            totalVotes,
            candidates: candidatesWithStats,
            updatedAt: new Date().toISOString(),
        };
    });
};

const getSessionStatsReadModel = async (sessionId) => {
    const normalizedSessionId = Number(sessionId);
    return withMapCache(sessionStatsCache, normalizedSessionId, async () => {
        const contract = getReadContract();
        const provider = getReadProvider();
        const session = await ensureSessionExists(normalizedSessionId);

        let totalNFTHolders = 0;
        let registeredLabel = 'Pemegang Student NFT';
        const restrictedVoters = await contract.getSessionAllowedVoters(normalizedSessionId);
        if (restrictedVoters.length > 0) {
            totalNFTHolders = restrictedVoters.length;
            registeredLabel = 'Daftar pemilih sesi';
        } else {
            const nextId = await contract.nextTokenId();
            totalNFTHolders = Number(nextId);
        }

        const deployBlockRaw = Number.parseInt(process.env.CONTRACT_DEPLOY_BLOCK || process.env.NEXT_PUBLIC_CONTRACT_DEPLOY_BLOCK || '0', 10);
        const deployBlock = Number.isFinite(deployBlockRaw) && deployBlockRaw >= 0 ? deployBlockRaw : 0;
        const latestBlock = await provider.getBlockNumber();
        const filter = contract.filters.Voted(normalizedSessionId, null, null);
        const voterAddresses = new Set();
        const chunkSize = getEventChunkSize();

        for (let from = deployBlock; from <= latestBlock; from += chunkSize) {
            const to = Math.min(from + chunkSize - 1, latestBlock);
            const events = await contract.queryFilter(filter, from, to);
            for (const log of events) {
                const voter = log?.args?.voter;
                if (voter) {
                    voterAddresses.add(String(voter).toLowerCase());
                }
            }
        }

        const uniqueVoterCount = voterAddresses.size;
        const participationRate = totalNFTHolders > 0
            ? ((uniqueVoterCount / totalNFTHolders) * 100).toFixed(1)
            : '0.0';

        return {
            session,
            totalNFTHolders,
            uniqueVoterCount,
            participationRate,
            registeredLabel,
            updatedAt: new Date().toISOString(),
        };
    });
};

const getSessionAllowlistReadModel = async (sessionId) => {
    const normalizedSessionId = Number(sessionId);
    return withMapCache(sessionAllowlistCache, normalizedSessionId, async () => {
        const contract = getReadContract();
        const session = await ensureSessionExists(normalizedSessionId);
        const voters = await contract.getSessionAllowedVoters(normalizedSessionId);
        const addresses = voters.map((address) => ethers.getAddress(String(address)));

        return {
            session,
            addresses,
            updatedAt: new Date().toISOString(),
        };
    });
};

const invalidateReadModel = ({ sessionId = null, sessions = false, all = false } = {}) => {
    if (all) {
        sessionsCache.value = null;
        sessionsCache.expiresAt = 0;
        sessionsCache.promise = null;
        sessionResultsCache.clear();
        sessionStatsCache.clear();
        sessionAllowlistCache.clear();
        return;
    }

    if (sessions) {
        sessionsCache.value = null;
        sessionsCache.expiresAt = 0;
        sessionsCache.promise = null;
    }

    if (sessionId != null) {
        const normalizedSessionId = Number(sessionId);
        sessionResultsCache.delete(normalizedSessionId);
        sessionStatsCache.delete(normalizedSessionId);
        sessionAllowlistCache.delete(normalizedSessionId);
    }
};

module.exports = {
    getContract: getReadContract,
    getProvider: getReadProvider,
    getSessionsReadModel,
    getSessionResultsReadModel,
    getSessionStatsReadModel,
    getSessionAllowlistReadModel,
    invalidateReadModel,
};
