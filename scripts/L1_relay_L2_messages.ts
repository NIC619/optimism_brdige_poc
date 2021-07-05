import { config, ethers } from "hardhat"
import { loadContract } from "@eth-optimism/contracts"
import { sleep } from "@eth-optimism/core-utils"
import { getMessagesAndProofsForL2Transaction } from "@eth-optimism/message-relayer"

async function main() {
    const conf: any = config.networks.kovan

    // Set up our RPC provider connections.
    const l1RpcProvider = ethers.provider

    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
    if (deployerPrivateKey === undefined) throw Error("Deployer private key not provided")

    const l1Wallet = new ethers.Wallet(deployerPrivateKey, ethers.provider)

    // L1 messenger address depends on the deployment.
    const l1MessengerAddress = conf.l1MessengerAddress // Kovan
    const L1_CrossDomainMessenger = loadContract("OVM_L1CrossDomainMessenger", l1MessengerAddress, l1RpcProvider)

    const l1RpcProviderUrl = (config.networks.kovan as any).url
    const l2RpcProviderUrl = conf.optimismURL
    const l1StateCommitmentChainAddress = conf.l1StateCommitmentChainAddress
    const l2CrossDomainMessengerAddress = conf.l2MessengerAddress
    const l2TransactionHash = "0xf5f8d36370b0ead3eea502eb09911ae02c57c90a5b7b88bbf4eb7d73aff77c37"

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
                console.log(`no state root batch for tx yet, trying again in 5s...`)
                await sleep(5000)
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
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
