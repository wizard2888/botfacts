require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

let PRIVATE_KEY = process.env.PRIVATE_KEY || "";
if (PRIVATE_KEY && !PRIVATE_KEY.startsWith("0x")) {
  PRIVATE_KEY = "0x" + PRIVATE_KEY;
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    botTestnet: {
      url: "https://rpc.bohr.life",
      chainId: 968,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    botMainnet: {
      url: "https://rpc.botchain.ai",
      chainId: 677,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
