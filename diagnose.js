const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const wallet = new ethers.Wallet(privateKey, provider);

    const address = wallet.address;
    console.log("Address:", address);

    const nonce = await provider.getTransactionCount(address);
    console.log("Current Nonce:", nonce);

    const balance = await provider.getBalance(address);
    console.log("Balance:", balance.toString());
}

main();
