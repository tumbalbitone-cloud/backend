const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const privateKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // Account #1
    const wallet = new ethers.Wallet(privateKey, provider);

    const address = wallet.address;
    console.log("Address:", address);

    const nonce = await provider.getTransactionCount(address);
    console.log("Current Nonce:", nonce);

    const balance = await provider.getBalance(address);
    console.log("Balance:", balance.toString());
}

main();
