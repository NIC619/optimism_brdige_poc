import * as fs from "fs"
import * as path from "path"
import { config, ethers } from "hardhat"
import { getL1Wallet, getL2ERC20, getL2StandardBridge, getL2Wallet } from "./utils"

async function main() {
    const l1Wallet = getL1Wallet()
    const l2Wallet = getL2Wallet()

    const L2_StandardBridge = getL2StandardBridge()
    const L2_ERC20 = getL2ERC20()

    console.log(`L1 ETH balance: ${(await l1Wallet.getBalance()).toString()}`)
    console.log(`L2 ETH balance: ${(await l2Wallet.getBalance()).toString()}`)

    const pendingTransactionsFilePath = path.join(
        config.paths["root"],
        "pendingTransactions.json"
    )
    const pendingTransactions: [string: {}] = require(pendingTransactionsFilePath)

    // Checking balance
    const withdrawAmount = ethers.utils.parseUnits("10")
    const l2Balance = await L2_ERC20.balanceOf(l1Wallet.address)
    console.log(`L2 ERC20 Balance: ${l2Balance.toString()}`)
    if (l2Balance.lt(withdrawAmount)) {
        throw new Error("L2 balance not enough")
    }

    console.log("Approving L2 StandardBridge...")
    const approve_l2_erc20_tx = await L2_ERC20.connect(l2Wallet).approve(
        L2_StandardBridge.address,
        withdrawAmount,
        {
            gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        }
    )
    console.log(`approve_l2_erc20_tx L2 tx hash: ${approve_l2_erc20_tx.hash}`)
    await approve_l2_erc20_tx.wait()

    console.log("Withdrawing from L2...")
    const receiverAddress = l1Wallet.address
    const withdraw_L2_ERC20_tx = await L2_StandardBridge.connect(l2Wallet).withdrawTo(
        L2_ERC20.address,
        receiverAddress,
        withdrawAmount,
        100000, //L2 gas limit
        "0x", //data
        {
            gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        }
    )
    console.log(`withdraw_L2_ERC20_tx L2 tx hash: ${withdraw_L2_ERC20_tx.hash}`)
    pendingTransactions[withdraw_L2_ERC20_tx.hash] = {
        "layer": "L2",
        "status": "Sent"
    }

    await withdraw_L2_ERC20_tx.wait()
    pendingTransactions[withdraw_L2_ERC20_tx.hash]["status"] = "Waiting"
    fs.writeFileSync(pendingTransactionsFilePath, JSON.stringify(pendingTransactions, null, 2))
 
    console.log("Successfully submit withdrawal of ERC20 from L2, now wait for challenge period to pass")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
