import { config, ethers } from "hardhat"
import { loadContract } from "@eth-optimism/contracts"
import { sleep } from "@eth-optimism/core-utils"
import { getMessagesAndProofsForL2Transaction } from "@eth-optimism/message-relayer"
import { Watcher } from "@eth-optimism/watcher"

// Configs
const conf: any = config.networks.kovan
const BLOCKTIME_SECONDS = conf.blocktime
export const CHALLENGE_PERIOD_BLOCKS = 60
export const CHALLENGE_PERIOD_SECONDS = CHALLENGE_PERIOD_BLOCKS * BLOCKTIME_SECONDS // 60 blocks for challenge period in Kovan
const WATCHER_POLL_INTERVAL = 1500 // 1.5s

export const l1RpcProviderUrl = (config.networks.kovan as any).url
export const l2RpcProviderUrl = conf.optimismURL

const l1CrossDomainMessengerAddress = conf.l1MessengerAddress
export const l2CrossDomainMessengerAddress = conf.l2MessengerAddress
const l1StandardBridgeAddress = conf.l1StandardBridgeAddress
const l2StandardBridgeAddress = conf.l2StandardBridgeAddress
export const l1StateCommitmentChainAddress = conf.l1StateCommitmentChainAddress

export const l1ERC20Address = conf.l1ERC20Address
const l2ERC20Address = conf.l2ERC20Address
const l2ETHAddress = conf.l2ETHAddress

// Contract factor and instance helper
export const factory = (name, ovm = false) => {
    const artifact = require(`~/artifacts${ovm ? "-ovm" : ""}/contracts/${name}.sol/${name}.json`)
    return new ethers.ContractFactory(artifact.abi, artifact.bytecode)
}

export const instance = (name, address, provider?, ovm = false) => {
    const artifact = require(`~/artifacts${ovm ? "-ovm" : ""}/contracts/${name}.sol/${name}.json`)
    return new ethers.Contract(address, artifact.abi, provider)
}

// Provider, wallet and contract instances
export const getL1Provider = () => {
    return new ethers.providers.JsonRpcProvider(l1RpcProviderUrl)
}

export const getL2Provider = () => {
    return new ethers.providers.JsonRpcProvider(l2RpcProviderUrl)
}

export const getEnvPrivateKey = () => {
    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
    if (deployerPrivateKey === undefined) throw Error("Deployer private key not provided")
    return deployerPrivateKey
}

export const getL1Wallet = () => {
    const deployerPrivateKey = getEnvPrivateKey()
    const L1Provider = getL1Provider()
    return new ethers.Wallet(deployerPrivateKey, L1Provider)
}

export const getL2Wallet = () => {
    const deployerPrivateKey = getEnvPrivateKey()
    const L2Provider = getL2Provider()
    return new ethers.Wallet(deployerPrivateKey, L2Provider)
}

export const getL1CrossDomainMessenger = () => {
    const L1Provider = getL1Provider()
    return loadContract("OVM_L1CrossDomainMessenger", l1CrossDomainMessengerAddress, L1Provider)
}

export const getL2CrossDomainMessenger = () => {
    const L2Provider = getL2Provider()
    return loadContract("OVM_L2CrossDomainMessenger", l2CrossDomainMessengerAddress, L2Provider)
}

export const getL1StandardBridge = () => {
    const L1Provider = getL1Provider()
    return loadContract("OVM_L1StandardBridge", l1StandardBridgeAddress, L1Provider)
}

export const getL2StandardBridge = () => {
    const L2Provider = getL2Provider()
    return loadContract("OVM_L2StandardBridge", l2StandardBridgeAddress, L2Provider)
}

export const getL1ERC20 = () => {
    const L1Provider = getL1Provider()
    return instance("ERC20", l1ERC20Address, L1Provider)
}

export const getL2ERC20 = () => {
    const L2Provider = getL2Provider()
    return instance("L2StandardERC20Initializeable", l2ERC20Address, L2Provider, true)
}

export const getL2ETH = () => {
    const L2Provider = getL2Provider()
    return instance("ERC20", l2ETHAddress, L2Provider, true)
}

export const getWatcher = (pollInterval = WATCHER_POLL_INTERVAL) => {
    const L1Provider = getL1Provider()
    const L2Provider = getL2Provider()
    // Tool that helps watches and waits for messages to be relayed between L1 and L2.
    return new Watcher({
        l1: {
            provider: L1Provider,
            messengerAddress: l1CrossDomainMessengerAddress
        },
        l2: {
            provider: L2Provider,
            messengerAddress: l2CrossDomainMessengerAddress
        },
        pollInterval: pollInterval
    })
}

// Relay L2 message
export const relayL2Message = async (l2TransactionHash) => {
    const l1Wallet = getL1Wallet()
    const L1_CrossDomainMessenger = getL1CrossDomainMessenger()

    console.log(`Searching for messages in transaction: ${l2TransactionHash}`)
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
                console.log(`No state root batch for tx yet, trying again in ${BLOCKTIME_SECONDS}s...`)
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
                    `Relayed message ${i + 1}/${messagePairs.length}! L1 tx hash: ${result.hash
                    }`
                )
                break
            } catch (err) {
                // Kovan provider does not provide error message if tx reverts
                // if (err.message.includes("execution failed due to an exception")) {
                //     console.log(`Fraud proof may not be elapsed, trying again in 5s...`)
                //     await sleep(5000)
                // } else if (err.message.includes("message has already been received")) {
                //     console.log(
                //         `Message ${i + 1}/${messagePairs.length
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
}