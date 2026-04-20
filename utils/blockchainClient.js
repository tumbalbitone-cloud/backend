const { ethers } = require('ethers');
const VotingSystemArtifact = require('../contracts/VotingSystem.json');

const DEFAULT_RPC_URL = 'http://127.0.0.1:8545';
const EXTRA_ABI = [
    'function getSessionAllowedVoters(uint256 _sessionId) view returns (address[] memory)',
    'function isEligibleForSession(uint256 _sessionId, address _voter) view returns (bool)',
    'function setSessionAllowedVoters(uint256 _sessionId, address[] memory _voters)',
];

let readProviderInstance = null;
let writeSignerInstance = null;
let readContractInstance = null;
let writeContractInstance = null;
let eventProviderInstance = null;
let eventContractInstance = null;

const getRpcUrl = () => (process.env.BLOCKCHAIN_RPC_URL || DEFAULT_RPC_URL).trim();
const getWsUrl = () => (process.env.BLOCKCHAIN_WS_URL || getRpcUrl()).trim();

const getContractAddress = () => {
    const contractAddress = process.env.VOTING_SYSTEM_ADDRESS;
    if (!contractAddress || String(contractAddress).trim() === '') {
        throw new Error('VOTING_SYSTEM_ADDRESS is not configured');
    }
    return String(contractAddress).trim();
};

const getAugmentedAbi = () => [
    ...(Array.isArray(VotingSystemArtifact.abi) ? VotingSystemArtifact.abi : []),
    ...EXTRA_ABI,
];

const getReadProvider = () => {
    if (!readProviderInstance) {
        readProviderInstance = new ethers.JsonRpcProvider(getRpcUrl());
    }
    return readProviderInstance;
};

const getWriteSigner = () => {
    if (!writeSignerInstance) {
        const privateKey = process.env.ADMIN_PRIVATE_KEY && String(process.env.ADMIN_PRIVATE_KEY).trim();
        if (!privateKey) {
            throw new Error('ADMIN_PRIVATE_KEY is not configured');
        }
        writeSignerInstance = new ethers.Wallet(privateKey, getReadProvider());
    }
    return writeSignerInstance;
};

const getReadContract = () => {
    if (!readContractInstance) {
        readContractInstance = new ethers.Contract(
            getContractAddress(),
            getAugmentedAbi(),
            getReadProvider()
        );
    }
    return readContractInstance;
};

const getWriteContract = () => {
    if (!writeContractInstance) {
        writeContractInstance = new ethers.Contract(
            getContractAddress(),
            getAugmentedAbi(),
            getWriteSigner()
        );
    }
    return writeContractInstance;
};

const getEventProvider = () => {
    if (!eventProviderInstance) {
        const rpcUrl = getWsUrl();
        if (rpcUrl.startsWith('ws://') || rpcUrl.startsWith('wss://')) {
            try {
                eventProviderInstance = new ethers.WebSocketProvider(rpcUrl);
            } catch (error) {
                console.warn('⚠️ WebSocket provider gagal, fallback ke HTTP:', error.message);
                eventProviderInstance = getReadProvider();
            }
        } else {
            eventProviderInstance = getReadProvider();
        }
    }
    return eventProviderInstance;
};

const getEventContract = () => {
    if (!eventContractInstance) {
        eventContractInstance = new ethers.Contract(
            getContractAddress(),
            getAugmentedAbi(),
            getEventProvider()
        );
    }
    return eventContractInstance;
};

module.exports = {
    getAugmentedAbi,
    getContractAddress,
    getReadProvider,
    getReadContract,
    getWriteSigner,
    getWriteContract,
    getEventProvider,
    getEventContract,
};
