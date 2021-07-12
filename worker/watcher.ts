import * as path from "path"
import { config } from "hardhat"
import { BigNumber, Contract } from "ethers"
import logger from "./logger"
import { getL1CrossDomainMessenger, getL1StandardBridge, getL1Wallet, getL2CrossDomainMessenger, getL2StandardBridge, getL2Wallet, l1ERC20Address, l2ERC20Address } from "../scripts/utils"

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

    // const pendingTransactions: [string: {}] = require(pendingTransactionsFilePath)
    // for (const [txHash, info] of Object.entries(pendingTransactions)) {
    // }
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
}