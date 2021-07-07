import { config, ethers } from "hardhat"
import { loadContract } from "@eth-optimism/contracts"
import { sleep } from "@eth-optimism/core-utils"
import { getMessagesAndProofsForL2Transaction } from "@eth-optimism/message-relayer"

export const factory = (name, ovm = false) => {
    const artifact = require(`~/artifacts${ovm ? "-ovm" : ""}/contracts/${name}.sol/${name}.json`)
    return new ethers.ContractFactory(artifact.abi, artifact.bytecode)
}

export const instance = (name, address, provider?, ovm = false) => {
    const artifact = require(`~/artifacts${ovm ? "-ovm" : ""}/contracts/${name}.sol/${name}.json`)
    return new ethers.Contract(address, artifact.abi, provider)
}

export const relayL2Message = async (l2TransactionHash, l1Wallet) => {
    const conf: any = config.networks.kovan
    const BLOCKTIME_SECONDS = conf.blocktime
    const l1RpcProviderUrl = (config.networks.kovan as any).url
    const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1RpcProviderUrl)
    const l2RpcProviderUrl = conf.optimismURL
    const l1StateCommitmentChainAddress = conf.l1StateCommitmentChainAddress
    const l1MessengerAddress = conf.l1MessengerAddress // Kovan
    const l2CrossDomainMessengerAddress = conf.l2MessengerAddress

    const L1_CrossDomainMessenger = loadContract("OVM_L1CrossDomainMessenger", l1MessengerAddress, l1RpcProvider)

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