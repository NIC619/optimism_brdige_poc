import * as fs from "fs"
import * as path from "path"
import { config, ethers } from "hardhat"
import { loadContract } from "@eth-optimism/contracts"
import { sleep } from "@eth-optimism/core-utils"
import { getStateBatchAppendedEventByTransactionIndex } from "@eth-optimism/message-relayer"
import { Watcher } from "@eth-optimism/watcher"
import { instance, relayL2Message } from "./utils"

const conf: any = config.networks.kovan

const BLOCKTIME_SECONDS = conf.blocktime
const CHALLENGE_PERIOD_BLOCKS = 60
const CHALLENGE_PERIOD_SECONDS = CHALLENGE_PERIOD_BLOCKS * BLOCKTIME_SECONDS // 60 blocks for challenge period in Kovan
const WATCHER_POLL_INTERVAL = 1500 // 1.5s

// Set up our RPC provider connections.
const l1RpcProviderUrl = (config.networks.kovan as any).url
const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1RpcProviderUrl)
const l2RpcProviderUrl = conf.optimismURL
const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2RpcProviderUrl)

const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
if (deployerPrivateKey === undefined) throw Error("Deployer private key not provided")

const l1Wallet = new ethers.Wallet(deployerPrivateKey, ethers.provider)
const l2Wallet = new ethers.Wallet(deployerPrivateKey, l2RpcProvider)

const l1MessengerAddress = conf.l1MessengerAddress // Kovan
const l1StandardBridgeAddress = conf.l1StandardBridgeAddress // Kovan
const l2CrossDomainMessengerAddress = conf.l2MessengerAddress
const l2StandardBridgeAddress = conf.l2StandardBridgeAddress
const l1StateCommitmentChainAddress = conf.l1StateCommitmentChainAddress

const L1_StandardBridge = loadContract("OVM_L1StandardBridge", l1StandardBridgeAddress, l1RpcProvider)
const L2_StandardBridge = loadContract("OVM_L2StandardBridge", l2StandardBridgeAddress, l2RpcProvider)

// Tool that helps watches and waits for messages to be relayed between L1 and L2.
const watcher = new Watcher({
    l1: {
        provider: l1RpcProvider,
        messengerAddress: l1MessengerAddress
    },
    l2: {
        provider: l2RpcProvider,
        messengerAddress: l2CrossDomainMessengerAddress
    },
    pollInterval: WATCHER_POLL_INTERVAL
})

const l1ERC20Address = "0x0712629Ced85A3A62E5BCa96303b8fdd06CBF8dd" // Kovan LON
const l2ERC20Address = "0x235d9B4249E9C9D705fAC6E98F7D21E58091220A"
const L1_ERC20 = instance("ERC20", l1ERC20Address, l1RpcProvider)
const L2_ERC20 = instance("L2StandardERC20Initializeable", l2ERC20Address, l2RpcProvider, true)

async function checkPendingWithdrawals() {
    const pendingWithdrawalsFilePath = path.join(
        config.paths["root"],
        "pendingWithdrawals.json"
    )
    const pendingWithdrawals = require(pendingWithdrawalsFilePath)
    for (const [L2_tx_hash, status] of Object.entries(pendingWithdrawals)) {
        console.log(L2_tx_hash)

        // TODO: how to verify if it is indded a withdraw tx?

        // Verify if L2 withdraw tx succeeded
        const l2Transaction = await l2RpcProvider.getTransaction(L2_tx_hash)
        if (l2Transaction === null) {
            console.log(`Can not find L2 tx: ${L2_tx_hash}`)
            console.log("Dropping it from pendingWithdrawals file...")
            delete pendingWithdrawals[L2_tx_hash]
            continue
        }
        const L2_tx_receipt = await l2RpcProvider.getTransactionReceipt(L2_tx_hash)
        if (L2_tx_receipt == null) {
            console.log(`Can not find tx receipt for L2 tx: ${L2_tx_hash}`)
            continue
        }
        if (L2_tx_receipt.status == 0) {
            console.log(`tx reverted for L2 tx: ${L2_tx_hash}`)
            console.log("Dropping it from pendingWithdrawals file...")
            delete pendingWithdrawals[L2_tx_hash]
            continue
        }
        // Verify it has been included in tx batch and was sent to L1
        pendingWithdrawals[L2_tx_hash]["status"] = "Confirmed on L2"
        const NUM_L2_GENESIS_BLOCKS = 1
        const stateBatchAppendedEvent = await getStateBatchAppendedEventByTransactionIndex(
            // @ts-ignore
            l1RpcProvider,
            l1StateCommitmentChainAddress,
            // @ts-ignore
            l2Transaction.blockNumber - NUM_L2_GENESIS_BLOCKS
        )
        if (stateBatchAppendedEvent === null) {
            console.log(`L2 tx: ${L2_tx_hash} is not batched into L1 yet`)
            continue
        }

        const stateBatchTransaction = await stateBatchAppendedEvent.getTransaction()
        const L1_sate_root_submission_tx_hash = stateBatchTransaction.hash
        const L1_sate_root_submission_tx_receipt = await l1RpcProvider.getTransactionReceipt(L1_sate_root_submission_tx_hash)
        const inclusionBlockNumber = L1_sate_root_submission_tx_receipt.blockNumber
        const latestBlockNumber = await l1RpcProvider.getBlockNumber()
        // TODO: this check might be redundant
        if (latestBlockNumber < inclusionBlockNumber) throw Error(
            "Something went wrong. Latest block number is smaller than L2 tx inclusion block number"
        )
        if (latestBlockNumber - inclusionBlockNumber < CHALLENGE_PERIOD_BLOCKS) {
            console.log(`L2 withdraw tx: ${L2_tx_hash} is still in challenge period`)
            pendingWithdrawals[L2_tx_hash]["status"] = "Still in challenge period"
            continue
        }
        // Check if it's already relayed or it's not a cross domain tx at all
        const [L2_tx_msg_hash] = await watcher.getMessageHashesFromL2Tx(L2_tx_hash)
        if (L2_tx_msg_hash == undefined) {
            console.log(`Not a cross domain tx: ${L2_tx_hash}`)
            console.log("Dropping it from pendingWithdrawals file...")
            delete pendingWithdrawals[L2_tx_hash]
            continue
        } else {
            // Watcher will throw error if same messages are relayed multiple times on L1
            // But it should not be the case for a withdraw tx
            // TODO: verify if failed relayed is included in this case
            const L1_tx_receipt = await watcher.getL1TransactionReceipt(L2_tx_msg_hash, false)
            if (L1_tx_receipt == undefined) {
                console.log(`L2 withdraw tx: ${L2_tx_hash} is ready to be relayed`)
                await relayL2Message(L2_tx_hash, l1Wallet)
                console.log(`Successfully relayed L2 withdraw tx: ${L2_tx_hash}`)
                console.log("Dropping it from pendingWithdrawals file...")
                delete pendingWithdrawals[L2_tx_hash]
            } else {
                // TODO: related to previous TODO, should we check if the L1 withdraw tx succeed?
                console.log(`L2 withdraw tx: ${L2_tx_hash} is already relayed by L1 tx: ${L1_tx_receipt.transactionHash}`)
                console.log("Dropping it from pendingWithdrawals file...")
                delete pendingWithdrawals[L2_tx_hash]    
            }
            continue
        }
    }
    fs.writeFileSync(pendingWithdrawalsFilePath, JSON.stringify(pendingWithdrawals, null, 2))
}

async function cycle() {
    // Initial balances.
    console.log(`L1 ETH balance: ${ethers.utils.formatUnits(await l1Wallet.getBalance(), 18)}`)
    console.log(`L2 ETH balance: ${ethers.utils.formatUnits(await l2Wallet.getBalance(), 18)}`)
    console.log(`L1 ERC20 Balance: ${ethers.utils.formatUnits(await L1_ERC20.balanceOf(l1Wallet.address), 18)}`)
    console.log(`L2 ERC20 Balance: ${ethers.utils.formatUnits(await L2_ERC20.balanceOf(l1Wallet.address), 18)}`)

    /**
    * L1: Deposit ERC20
    */
    console.log("-------------------------------------------")
    console.log("| 1. Depositing ERC20 from L1...          |")
    console.log("-------------------------------------------")
    const depositAmount = ethers.utils.parseUnits("99")

    console.log("Approving L1 StandardBridge...")
    const approve_l1_erc20_tx = await L1_ERC20.connect(l1Wallet).approve(L1_StandardBridge.address, depositAmount)
    console.log(`approve_l1_erc20_tx L1 tx hash: ${approve_l1_erc20_tx.hash}`)
    await approve_l1_erc20_tx.wait()

    console.log("Depositing into L1 Standard Bridge...")
    const receiverAddress = l1Wallet.address
    const deposit_L1_ERC20_tx = await L1_StandardBridge.connect(l1Wallet).depositERC20To(
        L1_ERC20.address,
        L2_ERC20.address,
        receiverAddress,
        depositAmount,
        2000000, // L2 gas limit
        "0x" // data
    )
    console.log(`deposit_L1_ERC20_tx L1 tx hash: ${deposit_L1_ERC20_tx.hash}`)
    await deposit_L1_ERC20_tx.wait()

    // Wait for the message to be relayed to L2.
    console.log("Waiting for deposit to be relayed to L2...")
    const [msgHash] = await watcher.getMessageHashesFromL1Tx(deposit_L1_ERC20_tx.hash)
    const l2_receipt = await watcher.getL2TransactionReceipt(msgHash)
    console.log(`deposit_L1_ERC20_tx L2 tx hash: ${l2_receipt.transactionHash}`)
    console.log("Successfully deposit ERC20 from L1")

    console.log(`L1 ERC20 Balance: ${ethers.utils.formatUnits(await L1_ERC20.balanceOf(l1Wallet.address), 18)}`)
    console.log(`L2 ERC20 Balance: ${ethers.utils.formatUnits(await L2_ERC20.balanceOf(l1Wallet.address), 18)}`)

    /**
    * L2: Withdraw ERC20
    */
    console.log("-------------------------------------------")
    console.log("| 2. Withdrawing ERC20 from L2...         |")
    console.log("-------------------------------------------")
    const withdrawAmount = depositAmount

    console.log("Approving L2 StandardBridge...")
    const approve_l2_erc20_tx = await L2_ERC20.connect(l2Wallet).approve(
        L2_StandardBridge.address,
        withdrawAmount,
        {
            gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        }
    )
    console.log(`approve_l2_erc20_tx L1 tx hash: ${approve_l2_erc20_tx.hash}`)
    await approve_l2_erc20_tx.wait()

    console.log("Withdrawing...")
    const withdraw_L2_ERC20_tx = await L2_StandardBridge.connect(l2Wallet).withdrawTo(
        L2_ERC20.address,
        receiverAddress,
        withdrawAmount,
        100000, // L1 gas limit
        "0x", // data
        {
            gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        }
    )
    console.log(`withdraw_L2_ERC20_tx L2 tx hash: ${withdraw_L2_ERC20_tx.hash}`)
    await withdraw_L2_ERC20_tx.wait()
    console.log(`Successfully submit withdrawal of ERC20 from L2, now wait for challenge period(${CHALLENGE_PERIOD_SECONDS}s) to pass`)

    await sleep(CHALLENGE_PERIOD_SECONDS * 1000)

    /**
    * L1: Relaying ERC20 withdrawal message
    */
    console.log("-------------------------------------------")
    console.log("| 3. Relaying ERC20 withdrawal message... |")
    console.log("-------------------------------------------")
    const l2TransactionHash = withdraw_L2_ERC20_tx.hash

    await relayL2Message(l2TransactionHash, l1Wallet)

    console.log("Successfully relay ERC20 withdrawal")
    console.log(`L1 ETH balance: ${ethers.utils.formatUnits(await l1Wallet.getBalance(), 18)}`)
    console.log(`L2 ETH balance: ${ethers.utils.formatUnits(await l2Wallet.getBalance(), 18)}`)
    console.log(`L1 ERC20 Balance: ${ethers.utils.formatUnits(await L1_ERC20.balanceOf(l1Wallet.address), 18)}`)
    console.log(`L2 ERC20 Balance: ${ethers.utils.formatUnits(await L2_ERC20.balanceOf(l1Wallet.address), 18)}`)
    console.log("-------------------------------------------")
    console.log("| Cycle completes                         |")
    console.log("-------------------------------------------")
}

async function main() {
    // Checking L2 ERC20
    // const erc20L1TokenStored = await L2_ERC20.callStatic.l1Token()
    // if (erc20L1TokenStored !== L1_ERC20.address) {
    //     throw new Error("L1 ERC20 token address was not correctly set")
    // }
    // const erc20L2TokenBridgeStored = await L2_ERC20.callStatic.l2Bridge()
    // if (erc20L2TokenBridgeStored !== L2_StandardBridge.address) {
    //     throw new Error("L2 bridge address was not correctly set")
    // }

    await checkPendingWithdrawals()

    // while (true) {
    //     await cycle()
    // }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
