const { ethers } = require("ethers");
const fs = require('fs');

async function main() {
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

    const addressData = JSON.parse(fs.readFileSync('../frontend/src/contracts/address.json', 'utf8'));
    const nftAddress = addressData.StudentNFT;

    const artifact = JSON.parse(fs.readFileSync('../frontend/src/contracts/StudentNFT.json', 'utf8'));
    const contract = new ethers.Contract(nftAddress, artifact.abi, provider);

    console.log("NFT Contract Address:", nftAddress);

    const userAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // The address used previously
    const balance = await contract.balanceOf(userAddress);
    console.log(`Balance for ${userAddress}:`, balance.toString());

    if (balance > 0n) {
        // Find the token ID owned by this user
        // ERC721Enumerable would make this easier, but we can query Transfer events if needed.
        // Or since we know minting order...
        // Let's just list events from block 0
        const filter = contract.filters.Transfer(null, userAddress);
        const events = await contract.queryFilter(filter);
        if (events.length > 0) {
            console.log("Token ID:", events[events.length - 1].args[2].toString());
        }
    } else {
        console.log("User currently has 0 NFTs. They need to register again.");
    }
}

main().catch(console.error);
