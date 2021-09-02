import { getCanonicalTransactionChain, getL1Provider, getL1Wallet, getL2Provider, getL2Wallet, getWatcher, instance } from "../utils"
import { l1PingPongAddress, l2PingPongAddress } from "./utils"

async function main() {
    const l1Wallet = getL1Wallet()
    const l2Wallet = getL2Wallet()

    const watcher = getWatcher()

    console.log(`L1 ETH balance: ${(await l1Wallet.getBalance()).toString()}`)
    console.log(`L2 ETH balance: ${(await l2Wallet.getBalance()).toString()}`)

    const CTC = getCanonicalTransactionChain()
    const L1Provider = getL1Provider()
    const L1_PingPong = instance("PingPong", l1PingPongAddress, L1Provider)
    const L2Provider = getL2Provider()
    const L2_PingPong = instance("PingPong", l2PingPongAddress, L2Provider)

    const l1lastPingTimestampBefore = await L1_PingPong.callStatic.lastPingTimestamp()
    const l2lastPongTimestampBefore = await L2_PingPong.callStatic.lastPongTimestamp()
    console.log(`L1 Last ping timestamp: ${l1lastPingTimestampBefore}`)
    console.log(`L2 Last pong timestamp: ${l2lastPongTimestampBefore}`)

    const shouldSucceed = await L2_PingPong.callStatic.shouldSucceed()
    if (shouldSucceed == true) {
        console.log("Flip L2 shouldSucceed")
        const l2_flip_tx = await L2_PingPong.connect(l2Wallet).flip()
        await l2_flip_tx.wait()
    }
    console.log("Ping from L1...")
    const l1_ping_tx = await L1_PingPong.connect(l1Wallet).ping()
    console.log(`l1_ping_tx tx hash: ${l1_ping_tx.hash}`)
    await l1_ping_tx.wait()

    const CTCQueueIndex = (await CTC.callStatic.getQueueLength()) - 1
    console.log(`Queue index for L1 ping message: ${CTCQueueIndex}`)

    // Wait for the message to be relayed to L2.
    console.log("Waiting for ping to be relayed to L2...")
    const [msgHash] = await watcher.getMessageHashesFromL1Tx(l1_ping_tx.hash)
    const l2_receipt = await watcher.getL2TransactionReceipt(msgHash)
    console.log(`l1_ping_tx L2 tx hash: ${l2_receipt.transactionHash}`)
    
    const l1lastPingTimestampAfter = await L1_PingPong.callStatic.lastPingTimestamp()
    const l2lastPongTimestampAfter = await L2_PingPong.callStatic.lastPongTimestamp()
    console.log(`L1 Last ping timestamp: ${l1lastPingTimestampAfter}`)
    console.log(`L2 Last pong timestamp: ${l2lastPongTimestampAfter}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
