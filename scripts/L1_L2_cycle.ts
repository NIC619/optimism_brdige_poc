import { config, ethers } from "hardhat"
import { loadContract } from "@eth-optimism/contracts"
import { sleep } from "@eth-optimism/core-utils"
import { getMessagesAndProofsForL2Transaction } from "@eth-optimism/message-relayer"
import { Watcher } from "@eth-optimism/watcher"
import { instance } from "./utils"

const conf: any = config.networks.kovan

const BLOCKTIME_SECONDS = conf.blocktime
const CHALLENGE_PERIOD_SECONDS = 60 * BLOCKTIME_SECONDS // 60 blocks for challenge period in Kovan

// Set up our RPC provider connections.
const l1RpcProviderUrl = (config.networks.kovan as any).url
const l1RpcProvider = ethers.provider
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

const L1_CrossDomainMessenger = loadContract("OVM_L1CrossDomainMessenger", l1MessengerAddress, l1RpcProvider)

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
    }
})

const l1ERC20Address = "0x0712629Ced85A3A62E5BCa96303b8fdd06CBF8dd" // Kovan LON
const l2ERC20Address = "0x235d9B4249E9C9D705fAC6E98F7D21E58091220A"
const L1_ERC20 = instance("ERC20", l1ERC20Address, l1RpcProvider)
const L2_ERC20 = instance("L2StandardERC20Initializeable", l2ERC20Address, l2RpcProvider, true)

async function cycle() {
    // Initial balances.
    console.log(`L1 ETH balance: ${ethers.utils.formatUnits(await l1Wallet.getBalance(), 18)}`)
    console.log(`L2 ETH balance: ${ethers.utils.formatUnits(await l2Wallet.getBalance(), 18)}`)
    console.log(`ERC20 Balance on L1: ${ethers.utils.formatUnits(await L1_ERC20.balanceOf(l1Wallet.address), 18)}`)
    console.log(`ERC20 Balance on L2: ${ethers.utils.formatUnits(await L2_ERC20.balanceOf(l1Wallet.address), 18)}`)

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
        2000000, //L2 gas limit
        "0x" //data
    )
    console.log(`deposit_L1_ERC20_tx L1 tx hash: ${deposit_L1_ERC20_tx.hash}`)
    await deposit_L1_ERC20_tx.wait()

    // Wait for the message to be relayed to L2.
    console.log("Waiting for deposit to be relayed to L2...")
    const [msgHash] = await watcher.getMessageHashesFromL1Tx(deposit_L1_ERC20_tx.hash)
    const l2_receipt = await watcher.getL2TransactionReceipt(msgHash)
    console.log(`deposit_L1_ERC20_tx L2 tx hash: ${l2_receipt.transactionHash}`)
    console.log("Successfully deposit ERC20 from L1")

    console.log(`ERC20 Balance on L1: ${ethers.utils.formatUnits(await L1_ERC20.balanceOf(l1Wallet.address), 18)}`)
    console.log(`ERC20 Balance on L2: ${ethers.utils.formatUnits(await L2_ERC20.balanceOf(l1Wallet.address), 18)}`)

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
        100000, //L2 gas limit
        "0x", //data
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

    console.log(`searching for messages in transaction: ${l2TransactionHash}`)
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
                console.log(`no state root batch for tx yet, trying again in ${BLOCKTIME_SECONDS}s...`)
                await sleep(BLOCKTIME_SECONDS)
            } else {
                throw err
            }
        }
    }

    console.log(`Found ${messagePairs.length} messages`)
    for (let i = 0; i < messagePairs.length; i++) {
        console.log(`Relaying message ${i + 1}/${messagePairs.length}`)
        const { message, proof } = messagePairs[i]
        while (true) {
            try {
                const result = await L1_CrossDomainMessenger.connect(l1Wallet).relayMessage(
                    message.target,
                    message.sender,
                    message.message,
                    message.messageNonce,
                    proof
                )
                await result.wait()
                console.log(
                    `relayed message ${i + 1}/${messagePairs.length}! L1 tx hash: ${result.hash
                    }`
                )
                break
            } catch (err) {
                // Kovan provider does not provide error message if tx reverts
                // if (err.message.includes("execution failed due to an exception")) {
                //     console.log(`fraud proof may not be elapsed, trying again in 5s...`)
                //     await sleep(5000)
                // } else if (err.message.includes("message has already been received")) {
                //     console.log(
                //         `message ${i + 1}/${messagePairs.length
                //         } was relayed by someone else`
                //     )
                //     break
                // } else {
                //     throw err
                // }
                console.log(`Relay message ${i + 1}/${messagePairs.length} failed`)
            }
        }
    }
    console.log("Successfully relay ERC20 withdrawal")
    console.log(`ERC20 Balance on L1: ${ethers.utils.formatUnits(await L1_ERC20.balanceOf(l1Wallet.address), 18)}`)
    console.log(`ERC20 Balance on L2: ${ethers.utils.formatUnits(await L2_ERC20.balanceOf(l1Wallet.address), 18)}`)
}

async function main() {
    // Checking L2 ERC20
    const erc20L1TokenStored = await L2_ERC20.callStatic.l1Token()
    if (erc20L1TokenStored !== L1_ERC20.address) {
        throw new Error("L1 ERC20 token address was not correctly set")
    }
    const erc20L2TokenBridgeStored = await L2_ERC20.callStatic.l2Bridge()
    if (erc20L2TokenBridgeStored !== L2_StandardBridge.address) {
        throw new Error("L2 bridge address was not correctly set")
    }

    while (true) {
        await cycle()
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
