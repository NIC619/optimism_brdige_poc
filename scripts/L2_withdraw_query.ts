import { ethers } from "hardhat"
import { Watcher } from "@eth-optimism/watcher"
import { loadContract } from "@eth-optimism/contracts"
import { BigNumber } from "ethers"
import { instance } from "./utils"

async function main() {
    // Set up our RPC provider connections.
    const l1RpcProvider = ethers.provider
    const l2RpcProvider = new ethers.providers.JsonRpcProvider('https://kovan.optimism.io')

    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
    if (deployerPrivateKey === undefined) throw Error("Deployer private key not provided")

    const l1Wallet = new ethers.Wallet(deployerPrivateKey, ethers.provider)
    const l2Wallet = new ethers.Wallet(deployerPrivateKey, l2RpcProvider)

    // L1 messenger address depends on the deployment.
    const l1MessengerAddress = '0x4361d0F75A0186C05f971c566dC6bEa5957483fD' // Kovan
    // L2 messenger address is always the same.
    const l2MessengerAddress = '0x4200000000000000000000000000000000000007'
    // L2 standard bridge address is always the same.
    const l2StandardBridgeAddress = '0x4200000000000000000000000000000000000010'

    const L2_StandardBridge = loadContract('OVM_L2StandardBridge', l2StandardBridgeAddress, l2RpcProvider)

    // Tool that helps watches and waits for messages to be relayed between L1 and L2.
    const watcher = new Watcher({
        l1: {
            provider: l1RpcProvider,
            messengerAddress: l1MessengerAddress
        },
        l2: {
            provider: l2RpcProvider,
            messengerAddress: l2MessengerAddress
        }
    })

    const L2_tx_hash = '0xd49a4b9d809d1183e7e6c6588d2bf5e4fbe5fd282708d9359ab64128abd022cb'
    const [msgHash] = await watcher.getMessageHashesFromL2Tx(L2_tx_hash)
    const l2_receipt = await watcher.getL1TransactionReceipt(msgHash)
    console.log(`L1 withdraw tx hash: ${l2_receipt.transactionHash}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
