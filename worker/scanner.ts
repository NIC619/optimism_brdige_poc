import * as fs from "fs"
import * as path from "path"
import { config } from "hardhat"
import { getStateBatchAppendedEventByTransactionIndex } from "@eth-optimism/message-relayer"
import { getL1Provider, getL2Provider, getWatcher, l1StateCommitmentChainAddress } from "../scripts/utils"
import logger from "./logger"
import { BLOCKTIME_SECONDS, CHALLENGE_PERIOD_SECONDS, NUM_L2_GENESIS_BLOCKS } from "./config"

export default async function scanner(): Promise<void> {
    const l1Provider = getL1Provider()
    const l2Provider = getL2Provider()
    const watcher = getWatcher()

    logger.info("Scanner started")
    const pendingTransactionsFilePath = path.join(
        config.paths["root"],
        "pendingTransactions.json"
    )

    const pendingTransactions: [string: {}] = require(pendingTransactionsFilePath)
    for (const [txHash, info] of Object.entries(pendingTransactions)) {
        if (info["layer"] == "L1") {
            // Check if tx succeeded
            if (info["status"] == "Sent") {
                const l1Transaction = await l1Provider.getTransaction(txHash)
                if (l1Transaction === null) {
                    logger.info(`Can not find L1 tx: ${txHash}`)
                    logger.info("Dropping it from pendingTransactions file...")
                    delete pendingTransactions[txHash]
                    continue
                }
                const L1_tx_receipt = await l1Provider.getTransactionReceipt(txHash)
                if (L1_tx_receipt == null) {
                    logger.info(`Can not find tx receipt for L1 tx: ${txHash}`)
                    continue
                }
                if (L1_tx_receipt.status == 0) {
                    logger.info(`tx reverted for L1 tx: ${txHash}`)
                    logger.info("Dropping it from pendingTransactions file...")
                    delete pendingTransactions[txHash]
                    continue
                }
                info["status"] = "Waiting"
            }

            if (info["status"] == "Waiting") {
                // Check if tx is confirmed on L2
                // Or if tx should be replayed
                const [msgHash] = await watcher.getMessageHashesFromL1Tx(txHash)
                if (msgHash === undefined) {
                    logger.info(`Not a cross domain tx: ${txHash}`)
                    logger.info("Dropping it from pendingTransactions file...")
                    delete pendingTransactions[txHash]
                } else {
                    const l2_receipt = await watcher.getL2TransactionReceipt(msgHash, false)
                    if (l2_receipt !== undefined) {
                        info["status"] = "Relayed"
                        info["relayTxHash"] = l2_receipt.transactionHash
                        info["next action"] = "Withdraw"
                    }
                }
                continue
            } else if (info["status"] == "Relayed") {
                continue
            } else {
                logger.info(`Unknown status for ${txHash}: ${info["status"]}`)
                logger.info("Dropping it from pendingTransactions file...")
                delete pendingTransactions[txHash]
                continue
            }
        } else if (info["layer"] == "L2") {
            // Check and update withdraw tx status
            let l2Transaction
            if (info["status"] == "Sent") {
                // Check if L2 withdraw tx succeeded
                l2Transaction = await l2Provider.getTransaction(txHash)
                if (l2Transaction === null) {
                    logger.info(`Can not find L2 tx: ${txHash}`)
                    logger.info("Dropping it from pendingTransactions file...")
                    delete pendingTransactions[txHash]
                    continue
                }
                const L2_tx_receipt = await l2Provider.getTransactionReceipt(txHash)
                if (L2_tx_receipt == null) {
                    logger.info(`Can not find tx receipt for L2 tx: ${txHash}`)
                    continue
                }
                if (L2_tx_receipt.status == 0) {
                    logger.info(`tx reverted for L2 tx: ${txHash}`)
                    logger.info("Dropping it from pendingTransactions file...")
                    delete pendingTransactions[txHash]
                    continue
                }
                info["status"] = "Waiting"
                continue
            }

            if (info["status"] == "Waiting") {
                if (info["stateBatchTxInclusionBlockTimestamp"] === undefined) {
                    if (l2Transaction === undefined) l2Transaction = await l2Provider.getTransaction(txHash)
                    const stateBatchAppendedEvent = await getStateBatchAppendedEventByTransactionIndex(
                        // @ts-ignore
                        l1Provider,
                        l1StateCommitmentChainAddress,
                        // @ts-ignore
                        l2Transaction.blockNumber - NUM_L2_GENESIS_BLOCKS
                    )
                    if (stateBatchAppendedEvent === null) {
                        logger.info(`L2 tx: ${txHash} is not batched into L1 yet`)
                        continue
                    }
                    const stateBatchTransaction = await stateBatchAppendedEvent.getTransaction()
                    info["stateBatchTx"] = stateBatchTransaction.hash
                    const L1_sate_root_submission_tx_hash = info["stateBatchTx"]
                    const L1_sate_root_submission_tx_receipt = await l1Provider.getTransactionReceipt(L1_sate_root_submission_tx_hash)
                    const inclusionBlockNumber = L1_sate_root_submission_tx_receipt.blockNumber
                    const inclusionBlockTimestamp = (await l1Provider.getBlock(inclusionBlockNumber)).timestamp
                    info["stateBatchTxInclusionBlockTimestamp"] = inclusionBlockTimestamp
                }
                const inclusionBlockTimestamp = info["stateBatchTxInclusionBlockTimestamp"]
                const latestBlockNumber = await l1Provider.getBlockNumber()
                const latestBlockTimestamp = (await l1Provider.getBlock(latestBlockNumber)).timestamp
                // Add a buffer period before relaying L2 message.
                // This is mostly just precaution.
                const bufferPeriod = BLOCKTIME_SECONDS
                if (latestBlockTimestamp - inclusionBlockTimestamp < CHALLENGE_PERIOD_SECONDS + bufferPeriod) {
                    logger.info(`L2 withdraw tx: ${txHash} is still in challenge period`)
                    continue
                }
    
                // Check if it's already relayed or it's not a cross domain tx at all
                const [msgHash] = await watcher.getMessageHashesFromL2Tx(txHash)
                if (msgHash === undefined) {
                    logger.info(`Not a cross domain tx: ${txHash}`)
                    logger.info("Dropping it from pendingTransactions file...")
                    delete pendingTransactions[txHash]
                } else {
                    info["msgHash"] = msgHash
                    info["status"] = "Ready" 
                }
                continue
            } else if (info["status"] == "Ready" || info["status"] == "Relayed") {
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
    logger.info("Scanner finished")
}
