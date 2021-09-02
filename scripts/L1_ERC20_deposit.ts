import * as fs from "fs"
import * as path from "path"
import { config, ethers } from "hardhat"
import { BigNumber } from "ethers"
import { getL1ERC20, getL1StandardBridge, getL1Wallet, getL2ERC20, getL2Wallet, getWatcher } from "./utils"

async function main() {
    const l1Wallet = getL1Wallet()
    const l2Wallet = getL2Wallet()
    const L1_StandardBridge = getL1StandardBridge()

    const watcher = getWatcher()

    console.log(`L1 ETH balance: ${(await l1Wallet.getBalance()).toString()}`)
    console.log(`L2 ETH balance: ${(await l2Wallet.getBalance()).toString()}`)

    const L1_ERC20 = getL1ERC20()
    const L2_ERC20 = getL2ERC20()

    const pendingTransactionsFilePath = path.join(
        config.paths["root"],
        "pendingTransactions.json"
    )
    const pendingTransactions: [string: {}] = require(pendingTransactionsFilePath)

    // Checking balance
    const depositAmount = ethers.utils.parseUnits("10")
    const l1Balance = await L1_ERC20.balanceOf(l1Wallet.address)
    console.log(`L1 ERC20 Balance: ${l1Balance.toString()}`)
    if (l1Balance.lt(depositAmount)) {
        throw new Error("L1 balance not enough")
    }

    console.log("Approving L1 StandardBridge...")
    const approve_l1_erc20_tx = await L1_ERC20.connect(l1Wallet).approve(L1_StandardBridge.address, depositAmount)
    console.log(`approve_l1_erc20_tx L1 tx hash: ${approve_l1_erc20_tx.hash}`)
    await approve_l1_erc20_tx.wait()

    console.log("Depositing into L1 Standard Bridge...")
    const receiverAddress = l2Wallet.address
    const deposit_L1_ERC20_tx = await L1_StandardBridge.connect(l1Wallet).depositERC20To(
        L1_ERC20.address,
        L2_ERC20.address,
        receiverAddress,
        depositAmount,
        2000000, //L2 gas limit
        "0x" //data
    )
    console.log(`deposit_L1_ERC20_tx L1 tx hash: ${deposit_L1_ERC20_tx.hash}`)
    await deposit_L1_ERC20_tx.wait()

    pendingTransactions[deposit_L1_ERC20_tx.hash] = {
        "layer": "L1",
        "status": "Waiting",
    }
    fs.writeFileSync(pendingTransactionsFilePath, JSON.stringify(pendingTransactions, null, 2))

    // Wait for the message to be relayed to L2.
    console.log("Waiting for deposit to be relayed to L2...")
    const [msgHash] = await watcher.getMessageHashesFromL1Tx(deposit_L1_ERC20_tx.hash)
    const l2_receipt = await watcher.getL2TransactionReceipt(msgHash)
    console.log(`deposit_L1_ERC20_tx L2 tx hash: ${l2_receipt.transactionHash}`)

    pendingTransactions[deposit_L1_ERC20_tx.hash]["status"] = "Relayed"
    pendingTransactions[deposit_L1_ERC20_tx.hash]["relayTxHash"] = l2_receipt.transactionHash
    pendingTransactions[deposit_L1_ERC20_tx.hash]["next action"] = "Withdraw"
    fs.writeFileSync(pendingTransactionsFilePath, JSON.stringify(pendingTransactions, null, 2))

    // Checking balance
    const l2Balance: BigNumber = await L2_ERC20.balanceOf(receiverAddress)
    console.log(`L2 ERC20 Balance: ${l2Balance.toString()}`)
    if (!l2Balance.gte(depositAmount)) {
        throw new Error("L2 balance does not match")
    }
    console.log("Successfully deposit ERC20 from L1")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
