import * as fs from "fs"
import * as path from "path"
import { config } from "hardhat"
import { BigNumber, Contract } from "ethers"
import { getStateBatchAppendedEventByTransactionIndex } from "@eth-optimism/message-relayer"
import { getL1CrossDomainMessenger, getL1Provider, getL1StandardBridge, getL1Wallet, getL2CrossDomainMessenger, getL2Provider, getL2StandardBridge, getL2Wallet, getWatcher, l1ERC20Address, l1StateCommitmentChainAddress, l2ERC20Address } from "../scripts/utils"
import logger from "./logger"

const l1Provider = getL1Provider()
const l2Provider = getL2Provider()
const opWatcher = getWatcher()
const l1Wallet = getL1Wallet()
const l2Wallet = getL2Wallet()

const pendingTransactionsFilePath = path.join(
    config.paths["root"],
    "pendingTransactions.json"
)

export default async function watcher() {
    // L1
    const L1_StandardBridge: Contract = getL1StandardBridge()
    const L1_CrossDomainMessenger: Contract = getL1CrossDomainMessenger()
    L1_StandardBridge.on("ERC20DepositInitiated", l1DepositMessageHandler)
    // L1_CrossDomainMessenger.on("xDomainCalldata", l1CrossDomainMessageHandler)
    L1_StandardBridge.on("ERC20WithdrawalFinalized", l2WithdrawFinalizedHandler)

    // L2
    const L2_StandardBridge: Contract = getL2StandardBridge()
    const L2_CrossDomainMessenger: Contract = getL2CrossDomainMessenger()
    // L2_CrossDomainMessenger.on("RelayedMessage", l2CrossDomainMessageHandler)
    L2_StandardBridge.on("DepositFinalized", l2DepositFinalizedHandler)
    // L2_StandardBridge.on("DepositFailed", l2DepositFailedHandler)
    L2_StandardBridge.on("WithdrawalInitiated", l2WithdrawMessageHandler)

    logger.info("Watcher started")
}

async function l1DepositMessageHandler(
    _l1Token: string,
    _l2Token: string,
    _from: string,
    _to: string,
    amount: BigNumber,
    _data: string
) {
    logger.info("L1 ERC20 deposited:", {
        _l1Token,
        _l2Token,
        _from,
        _to,
        amount,
        _data
    })
    if (_l1Token != l1ERC20Address || _l2Token != l2ERC20Address) {
        return
    }
    if (_from != l1Wallet.address) {
        return
    }
    logger.info("deposit match")

    const pendingTransactions: [string: {}] = require(pendingTransactionsFilePath)
    for (const [txHash, info] of Object.entries(pendingTransactions)) {
        if (info["layer"] == "L1" && info["status"] == "Sent") {
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
            break
        }
    }
    fs.writeFileSync(pendingTransactionsFilePath, JSON.stringify(pendingTransactions, null, 2))
}

async function l2DepositFinalizedHandler(
    _l1Token: string,
    _l2Token: string,
    _from: string,
    _to: string,
    _amount: BigNumber,
    _data: string
) {
    logger.info("L2 ERC20 deposit finalized:", {
        _l1Token,
        _l2Token,
        _from,
        _to,
        _amount,
        _data
    })
    if (_l1Token != l1ERC20Address || _l2Token != l2ERC20Address) {
        return
    }
    if (_from != l1Wallet.address) {
        return
    }
    logger.info("deposit match")

    const pendingTransactions: [string: {}] = require(pendingTransactionsFilePath)
    for (const [txHash, info] of Object.entries(pendingTransactions)) {
        if (info["layer"] == "L1" && info["status"] == "Waiting") {
            // Check if tx is confirmed on L2
            // Or if tx should be replayed
            const [msgHash] = await opWatcher.getMessageHashesFromL1Tx(txHash)
            if (msgHash === undefined) {
                logger.info(`Not a cross domain tx: ${txHash}`)
                logger.info("Dropping it from pendingTransactions file...")
                delete pendingTransactions[txHash]
            } else {
                const l2_receipt = await opWatcher.getL2TransactionReceipt(msgHash, false)
                if (l2_receipt !== undefined) {
                    info["status"] = "Relayed"
                    info["relayTxHash"] = l2_receipt.transactionHash
                    info["next action"] = "Withdraw"
                    break
                }
            }
        }
    }
    fs.writeFileSync(pendingTransactionsFilePath, JSON.stringify(pendingTransactions, null, 2))
}

async function l2WithdrawMessageHandler(
    _l1Token: string,
    _l2Token: string,
    _from: string,
    _to: string,
    _amount: BigNumber,
    _data: string
) {
    logger.info("L2 ERC20 withdrawn:", {
        _l1Token,
        _l2Token,
        _from,
        _to,
        _amount,
        _data
    })
    if (_l1Token != l1ERC20Address || _l2Token != l2ERC20Address) {
        return
    }
    if (_from != l2Wallet.address) {
        return
    }
    logger.info("withdraw match")

    const pendingTransactions: [string: {}] = require(pendingTransactionsFilePath)
    for (const [txHash, info] of Object.entries(pendingTransactions)) {
        if (info["layer"] == "L2" && info["status"] == "Sent") {
            // Check if L2 withdraw tx succeeded
            const l2Transaction = await l2Provider.getTransaction(txHash)
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
            break
        }
    }
    fs.writeFileSync(pendingTransactionsFilePath, JSON.stringify(pendingTransactions, null, 2))
}

async function l2WithdrawFinalizedHandler(
    _l1Token: string,
    _l2Token: string,
    _from: string,
    _to: string,
    _amount: BigNumber,
    _data: string
) {
    logger.info("L2 ERC20 withdraw finalized:", {
        _l1Token,
        _l2Token,
        _from,
        _to,
        _amount,
        _data
    })
    if (_l1Token != l1ERC20Address || _l2Token != l2ERC20Address) {
        return
    }
    if (_from != l1Wallet.address) {
        return
    }
    logger.info("withdraw match")

    const pendingTransactions: [string: {}] = require(pendingTransactionsFilePath)
    for (const [txHash, info] of Object.entries(pendingTransactions)) {
        if (info["layer"] == "L2" && info["status"] == "Relayed" && info["next action"] == "Wait for confirmation") {
            info["next action"] = "Deposit"
            break
        }
    }
    fs.writeFileSync(pendingTransactionsFilePath, JSON.stringify(pendingTransactions, null, 2))

}