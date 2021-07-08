import { ethers } from "hardhat"
import { getL1StandardBridge, getL1Wallet, getL2Wallet, getWatcher } from "./utils"

async function main() {
    const l1Wallet = getL1Wallet()
    const l2Wallet = getL2Wallet()
    const L1_StandardBridge = getL1StandardBridge()

    const watcher = getWatcher()

    // Deploy the paired ERC20 token to L2.
    console.log("Depositing L1 ETH...")
    const l2ETHBalanceBefore = await l2Wallet.getBalance()
    console.log(`L2 ETH balance before: ${l2ETHBalanceBefore.toString()}`)
    const L1_ETH_deposit_tx = await L1_StandardBridge.connect(l1Wallet).depositETH(
        2000000, // L2 gas
        "0x",
        {
            value: ethers.utils.parseUnits("1")
        }
    )
    console.log(`L1_ETH_deposit_tx L1 tx hash: ${L1_ETH_deposit_tx.hash}`)
    await L1_ETH_deposit_tx.wait()

    const [msgHash] = await watcher.getMessageHashesFromL1Tx(L1_ETH_deposit_tx.hash)
    const l2_receipt = await watcher.getL2TransactionReceipt(msgHash)
    console.log(`L1_ETH_deposit_tx L2 tx hash: ${l2_receipt.transactionHash}`)

    const l2ETHBalanceAfter = await l2Wallet.getBalance()
    console.log(`L2 ETH balance afer: ${l2ETHBalanceAfter.toString()}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
