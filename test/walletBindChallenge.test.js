const test = require("node:test");
const assert = require("node:assert/strict");

const ORIGINAL_ENV = {
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  ADMIN_PRIVATE_KEY: process.env.ADMIN_PRIVATE_KEY,
  VC_ISSUER_PRIVATE_KEY: process.env.VC_ISSUER_PRIVATE_KEY,
  VOTING_SYSTEM_ADDRESS: process.env.VOTING_SYSTEM_ADDRESS,
  BLOCKCHAIN_RPC_URL: process.env.BLOCKCHAIN_RPC_URL,
  NODE_ENV: process.env.NODE_ENV,
};

test.afterEach(() => {
  Object.assign(process.env, ORIGINAL_ENV);
});

test("createWalletBindChallenge embeds normalized wallet details", () => {
  process.env.JWT_SECRET = "unit-test-secret";
  const {
    createWalletBindChallenge,
    verifyWalletBindChallenge,
  } = require("../utils/walletBindChallenge");

  const challenge = createWalletBindChallenge({
    studentId: " 13579 ",
    address: "0xAbCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
  });

  assert.ok(challenge.challengeToken);
  assert.match(challenge.message, /Student ID: 13579/);
  assert.match(
    challenge.message,
    /Wallet: 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd/,
  );

  const verified = verifyWalletBindChallenge(challenge.challengeToken);
  assert.equal(verified.studentId, "13579");
  assert.equal(
    verified.address,
    "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  );
  assert.equal(verified.message, challenge.message);
});

test("validateStartupEnvironment rejects missing required secrets", () => {
  process.env.JWT_SECRET = "";
  process.env.JWT_REFRESH_SECRET = "refresh";
  process.env.ADMIN_PRIVATE_KEY = "admin";
  process.env.VC_ISSUER_PRIVATE_KEY = "issuer";
  process.env.NODE_ENV = "development";

  const { validateStartupEnvironment } = require("../config/envValidation");

  assert.throws(
    () => validateStartupEnvironment(),
    /Missing required environment variable: JWT_SECRET/,
  );
});
