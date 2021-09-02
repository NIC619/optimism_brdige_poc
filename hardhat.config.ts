// Plugins
import "dotenv/config";
// import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-ethers";
// import "@nomiclabs/hardhat-etherscan"
import "@eth-optimism/hardhat-ovm";

// This adds support for typescript paths mappings
import "tsconfig-paths/register";

const accounts = {
  mnemonic:
    process.env.MNEMONIC ||
    "test test test test test test test test test test test junk",
};
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const ALCHEMY_TOKEN = process.env.ALCHEMY_TOKEN || ""

module.exports = {
  networks: {
    hardhat: {
      chainId: 1,
      accounts,
    },
    goerli: {
      chainId: 5,
      url: "https://goerli.infura.io/v3/47176b678344412893eeb9bb0cf7b560",
      accounts,
    },
    kovan: {
      chainId: 42,
      url: `https://eth-kovan.alchemyapi.io/v2/${ALCHEMY_TOKEN}`,
      optimismURL: "https://kovan.optimism.io",
      // optimismURL: "https://opt-kovan.g.alchemy.com/v2/lJhC7P3RrmIy2BEoFjyqF5UEY7eg2NkS",
      accounts,
      blocktime: 5,
      optimismChainId: 69,
      l2ETHAddress: "0x4200000000000000000000000000000000000006",
      CTCAddress: "0xe28c499EB8c36C0C18d1bdCdC47a51585698cb93",
      l1MessengerAddress: "0x4361d0F75A0186C05f971c566dC6bEa5957483fD",
      l2MessengerAddress: "0x4200000000000000000000000000000000000007",
      l1StandardBridgeAddress: "0x22F24361D548e5FaAfb36d1437839f080363982B",
      l2StandardBridgeAddress: "0x4200000000000000000000000000000000000010",
      l1StateCommitmentChainAddress:
        "0xa2487713665AC596b0b3E4881417f276834473d2",
      l1ERC20Address: "0x0712629Ced85A3A62E5BCa96303b8fdd06CBF8dd", // Kovan LON
      l2ERC20Address: "0x235d9B4249E9C9D705fAC6E98F7D21E58091220A",
    },
    // Add this network to your config!
    optimism: {
      url: "http://127.0.0.1:8545",
      accounts,
      // This sets the gas price to 0 for all transactions on L2. We do this
      // because account balances are not automatically initiated with an ETH
      // balance.
      gasPrice: 0,
      ovm: true, // This sets the network as using the ovm and ensure contract will be compiled against that.
    },
  },
  solidity: "0.7.6",
  ovm: {
    solcVersion: "0.7.6",
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};
