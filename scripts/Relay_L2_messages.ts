import { config, ethers } from "hardhat"
import { loadContract } from "@eth-optimism/contracts"
import { sleep } from '@eth-optimism/core-utils'
import { getMessagesAndProofsForL2Transaction } from '@eth-optimism/message-relayer'

async function main() {
    // Set up our RPC provider connections.
    const l1RpcProvider = ethers.provider

    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
    if (deployerPrivateKey === undefined) throw Error("Deployer private key not provided")

    const l1Wallet = new ethers.Wallet(deployerPrivateKey, ethers.provider)

    // L1 messenger address depends on the deployment.
    const l1MessengerAddress = '0x4361d0F75A0186C05f971c566dC6bEa5957483fD' // Kovan
    const L1_CrossDomainMessenger = loadContract('OVM_L1CrossDomainMessenger', l1MessengerAddress, l1RpcProvider)

    const l1RpcProviderUrl = (config.networks.kovan as any).url
    const l2RpcProviderUrl = 'https://kovan.optimism.io'
    const l1StateCommitmentChainAddress = '0xa2487713665AC596b0b3E4881417f276834473d2'
    const l2CrossDomainMessengerAddress = '0x4200000000000000000000000000000000000007'
    const l2TransactionHash = '0x58fc194045e248f8a9589f68018bff9ee9cdb3f658f91c87300f08df62e131ee'

    const messagePairs = await getMessagesAndProofsForL2Transaction(
        l1RpcProviderUrl,
        l2RpcProviderUrl,
        l1StateCommitmentChainAddress,
        l2CrossDomainMessengerAddress,
        l2TransactionHash
    )

    // console.log(messagePairs)
    console.log(`${messagePairs.length} messages included in L2 tx: ${l2TransactionHash}`)
    console.log('Relaying messages...')
    for (const { message, proof } of messagePairs) {
        const relay_tx = await L1_CrossDomainMessenger.connect(l1Wallet).relayMessage(
            message.target,
            message.sender,
            message.message,
            message.messageNonce,
            proof
        )
        console.log(`relay_tx L1 tx hash: ${relay_tx.hash}`)
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
