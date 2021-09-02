import { encodeXDomainCalldata, getL1CrossDomainMessenger } from "~/scripts/utils"
import { getL1Provider, getL1Wallet, getL2Provider, getL2Wallet, getWatcher, instance } from "../scripts/utils"
import { l1PingPongAddress, l2PingPongAddress } from "../scripts/ping_pong/utils"

async function main() {
    const l1Wallet = getL1Wallet()
    const l2Wallet = getL2Wallet()

    const watcher = getWatcher()

    console.log(`L1 ETH balance: ${(await l1Wallet.getBalance()).toString()}`)
    console.log(`L2 ETH balance: ${(await l2Wallet.getBalance()).toString()}`)

    const L1_CrossDomainMessenger = getL1CrossDomainMessenger()
    const L1Provider = getL1Provider()
    const L1_PingPong = instance("PingPong", l1PingPongAddress, L1Provider)
    const L2Provider = getL2Provider()
    const L2_PingPong = instance("PingPong", l2PingPongAddress, L2Provider)

    const l1lastPingTimestampBefore = await L1_PingPong.callStatic.lastPingTimestamp()
    const l2lastPongTimestampBefore = await L2_PingPong.callStatic.lastPongTimestamp()
    console.log(`L1 Last ping timestamp: ${l1lastPingTimestampBefore}`)
    console.log(`L2 Last pong timestamp: ${l2lastPongTimestampBefore}`)

    const shouldSucceed = await L2_PingPong.callStatic.shouldSucceed()
    if (shouldSucceed == false) {
        console.log("Flip L2 shouldSucceed")
        const l2_flip_tx = await L2_PingPong.connect(l2Wallet).flip()
        await l2_flip_tx.wait()
    }
    console.log("Replay L1 ping...")
    const message = L1_PingPong.interface.encodeFunctionData("pong", [])
    const l1_failed_ping_queueIndex = 3888
    const xDomainCalldata = encodeXDomainCalldata(
        L2_PingPong.address,
        L1_PingPong.address,
        message,
        l1_failed_ping_queueIndex
    )
    const replay_l1_ping_tx = await L1_CrossDomainMessenger.connect(l1Wallet).replayMessage(
        L2_PingPong.address, // target
        L1_PingPong.address, // sender
        xDomainCalldata, // message
        l1_failed_ping_queueIndex, // queue index
        1000000, // gas limit
    )
    console.log(`replay_l1_ping_tx tx hash: ${replay_l1_ping_tx.hash}`)
    await replay_l1_ping_tx.wait()

    // Wait for the message to be relayed to L2.
    console.log("Waiting for ping to be relayed to L2...")
    const [msgHash] = await watcher.getMessageHashesFromL1Tx(replay_l1_ping_tx.hash)
    const l2_receipt = await watcher.getL2TransactionReceipt(msgHash)
    console.log(`replay_l1_ping_tx L2 tx hash: ${l2_receipt.transactionHash}`)
    
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
