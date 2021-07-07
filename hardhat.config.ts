// Plugins
import "dotenv/config"
// import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-ethers"
// import "@nomiclabs/hardhat-etherscan"
import "@eth-optimism/hardhat-ovm"

// This adds support for typescript paths mappings
import "tsconfig-paths/register"

const accounts = {
    mnemonic: process.env.MNEMONIC || "test test test test test test test test test test test junk",
}
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || ""

module.exports = {
  networks: {
    hardhat: {
      chainId: 1,
      accounts
    },
    goerli: {
      chainId: 5,
      url: "",
      accounts
    },
    kovan: {
      chainId: 42,
      url: "",
      optimismURL: "https://kovan.optimism.io",
      accounts,
      blocktime: 5,
      l2ETHAddress: "0x4200000000000000000000000000000000000006",
      l1MessengerAddress: "0x4361d0F75A0186C05f971c566dC6bEa5957483fD",
      l2MessengerAddress: "0x4200000000000000000000000000000000000007",
      l1StandardBridgeAddress: "0x22F24361D548e5FaAfb36d1437839f080363982B",
      l2StandardBridgeAddress: "0x4200000000000000000000000000000000000010",
      l1StateCommitmentChainAddress: "0xa2487713665AC596b0b3E4881417f276834473d2",
    },
    // Add this network to your config!
    optimism: {
      url: "http://127.0.0.1:8545",
      accounts,
      // This sets the gas price to 0 for all transactions on L2. We do this
      // because account balances are not automatically initiated with an ETH
      // balance.
      gasPrice: 0,
      ovm: true // This sets the network as using the ovm and ensure contract will be compiled against that.
    },
  },
  solidity: "0.7.6",
  ovm: {
    solcVersion: "0.7.6"
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
}
