import * as fs from "fs"
import * as path from "path"
import { config } from "hardhat"
import { sleep } from "@eth-optimism/core-utils"
import { getMessagesAndProofsForL2Transaction } from "@eth-optimism/message-relayer"
import { getL1CrossDomainMessenger, getL1ERC20, getL1StandardBridge, getL1Wallet, getL2ERC20, getL2StandardBridge, getL2Wallet, getWatcher, l1RpcProviderUrl, l1StateCommitmentChainAddress, l2CrossDomainMessengerAddress, l2RpcProviderUrl, } from "../scripts/utils"
import logger from "./logger"
import { BLOCKTIME_SECONDS, depositAmount, withdrawAmount } from "./config"

export default async function worker(): Promise<void> {
    const watcher = getWatcher()

    logger.info("Worker started")
    const pendingTransactionsFilePath = path.join(
        config.paths["root"],
        "pendingTransactions.json"
    )

    const pendingTransactions: [string: {}] = require(pendingTransactionsFilePath)
    for (const [txHash, info] of Object.entries(pendingTransactions)) {
        if (info["layer"] == "L1") {
            if (info["status"] == "Sent" || info["status"] == "Waiting") {
                continue
            } else if (info["status"] == "Relayed") {
                if (info["next action"] == "Withdraw") {
                    // Initiate withdraw
                    await withdraw(pendingTransactions)
                    info["next action"] = "None"
                    continue
                }
            } else {
                logger.info(`Unknown status for ${txHash}: ${info["status"]}`)
                logger.info("Dropping it from pendingTransactions file...")
                delete pendingTransactions[txHash]
                continue
            }
        } else if (info["layer"] == "L2") {
            // Check and update withdraw tx status
            let l2Transaction
            if (info["status"] == "Sent" || info["status"] == "Waiting" || info["status"] == "Relayed") {
                continue
            } else if (info["status"] == "Ready") {            
                // Watcher will throw error if same messages are relayed multiple times on L1
                // But it should not be the case for a withdraw tx
                // TODO: verify if failed relayed is included in this case
                const msgHash = info["msgHash"]
                const L1_tx_receipt = await watcher.getL1TransactionReceipt(msgHash, false)
                if (L1_tx_receipt === undefined) {
                    const [relayTxHash] = await relayL2Message(txHash)
                    logger.info(`Successfully relayed L2 withdraw tx: ${txHash}`)
                    info["relayTxHash"] = relayTxHash
                } else {
                    // TODO: related to previous TODO, should we check if the L1 withdraw tx succeed?
                    logger.info(`L2 withdraw tx: ${txHash} is already relayed by L1 tx: ${L1_tx_receipt.transactionHash}`)
                    info["relayTxHash"] = L1_tx_receipt.transactionHash
                }
                info["status"] = "Relayed"
                // TODO: below condition check is redundant but we keep if for now
                // to make L1 & L2 relay procedures the same
                info["next action"] = "Deposit"
                if (info["next action"] == "Deposit") {
                    // Inititate deposit
                    await deposit(pendingTransactions)
                    info["next action"] = "None"
                }
                continue
            } else {
                logger.info(`Unknown status for ${txHash}: ${info["status"]}`)
                logger.info("Dropping it from pendingTransactions file...")
                delete pendingTransactions[txHash]
                continue
            }
        } else {
            logger.info(`Did not record if tx ${txHash} is a L1 or L2 tx`)
            logger.info("Dropping it from pendingTransactions file...")
            delete pendingTransactions[txHash]
            continue
        }
    }
    fs.writeFileSync(pendingTransactionsFilePath, JSON.stringify(pendingTransactions, null, 2))
    logger.info("Worker finished")
}

async function withdraw(pendingTransactions) {
    const L2_StandardBridge = getL2StandardBridge()
    const L2_ERC20 = getL2ERC20()
    const l2Wallet = getL2Wallet()

    // TODO: replace with MAX_INT allowance
    const approve_l2_erc20_tx = await L2_ERC20.connect(l2Wallet).approve(
        L2_StandardBridge.address,
        withdrawAmount,
        // {
        //     gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        // }
    )
    logger.info(`approve_l2_erc20_tx L2 tx hash: ${approve_l2_erc20_tx.hash}`)
    await approve_l2_erc20_tx.wait()

    const receiverAddress = l2Wallet.address
    const withdraw_L2_ERC20_tx = await L2_StandardBridge.connect(l2Wallet).withdrawTo(
        L2_ERC20.address,
        receiverAddress,
        withdrawAmount,
        100000, // L1 gas limit
        "0x", // data
        // {
        //     gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        // }
    )
    pendingTransactions[withdraw_L2_ERC20_tx.hash] = {
        "layer": "L2",
        "status": "Sent"
    }
    logger.info("Withdraw tx sent")
}

async function deposit(pendingTransactions) {
    const L1_StandardBridge = getL1StandardBridge()
    const L1_ERC20 = getL1ERC20()
    const L2_ERC20 = getL2ERC20()
    const l1Wallet = getL1Wallet()

    // TODO: replace with MAX_INT allowance
    const approve_l1_erc20_tx = await L1_ERC20.connect(l1Wallet).approve(L1_StandardBridge.address, depositAmount)
    logger.info(`approve_l1_erc20_tx L1 tx hash: ${approve_l1_erc20_tx.hash}`)
    await approve_l1_erc20_tx.wait()

    const receiverAddress = l1Wallet.address
    const deposit_L1_ERC20_tx = await L1_StandardBridge.connect(l1Wallet).depositERC20To(
        L1_ERC20.address,
        L2_ERC20.address,
        receiverAddress,
        depositAmount,
        2000000, // L2 gas limit
        "0x" // data
    )
    logger.info(`deposit_L1_ERC20_tx L1 tx hash: ${deposit_L1_ERC20_tx.hash}`)
    pendingTransactions[deposit_L1_ERC20_tx.hash] = {
        "layer": "L1",
        "status": "Sent"
    }
    logger.info("Deposit tx sent")
}

export const relayL2Message = async (l2TransactionHash) => {
    const l1Wallet = getL1Wallet()
    const L1_CrossDomainMessenger = getL1CrossDomainMessenger()

    logger.info(`Searching for messages in transaction: ${l2TransactionHash}`)
    let messagePairs: any[]
    while (true) {
        try {
            messagePairs = await getMessagesAndProofsForL2Transaction(
                l1RpcProviderUrl,
                l2RpcProviderUrl,
                l1StateCommitmentChainAddress,
                l2CrossDomainMessengerAddress,
                l2TransactionHash
            )
            break
        } catch (err) {
            if (err.message.includes("unable to find state root batch for tx")) {
                logger.info(`No state root batch for tx yet, trying again in ${BLOCKTIME_SECONDS}s...`)
                await sleep(BLOCKTIME_SECONDS)
            } else {
                throw err
            }
        }
    }

    logger.info(`Found ${messagePairs.length} messages`)
    const relayTransactionHashes: any[] = []
    for (let i = 0; i < messagePairs.length; i++) {
        logger.info(`Relaying message ${i + 1}/${messagePairs.length}`)
        const { message, proof } = messagePairs[i]
        try {
            const relay_L2_tx = await L1_CrossDomainMessenger.connect(l1Wallet).relayMessage(
                message.target,
                message.sender,
                message.message,
                message.messageNonce,
                proof
            )
            await relay_L2_tx.wait()
            logger.info(
                `Relayed message ${i + 1}/${messagePairs.length}! L1 tx hash: ${relay_L2_tx.hash
                }`
            )
            relayTransactionHashes.push(relay_L2_tx.hash)
        } catch (err) {
            // Kovan provider does not provide error message if tx reverts
            // if (err.message.includes("execution failed due to an exception")) {
            //     logger.info(`Fraud proof may not be elapsed, trying again in 5s...`)
            //     await sleep(5000)
            // } else if (err.message.includes("message has already been received")) {
            //     logger.info(
            //         `Message ${i + 1}/${messagePairs.length
            //         } was relayed by someone else`
            //     )
            //     break
            // } else {
            //     throw err
            // }
            logger.info(`Relay message ${i + 1}/${messagePairs.length} failed`)
        }
    }
    return relayTransactionHashes
}