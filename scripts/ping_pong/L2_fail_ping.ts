import { getL1Provider, getL1Wallet, getL2Provider, getL2Wallet, instance } from "../utils"
import { l1PingPongAddress, l2PingPongAddress } from "./utils"

async function main() {
    const l1Wallet = getL1Wallet()
    const l2Wallet = getL2Wallet()

    console.log(`L1 ETH balance: ${(await l1Wallet.getBalance()).toString()}`)
    console.log(`L2 ETH balance: ${(await l2Wallet.getBalance()).toString()}`)

    const L1Provider = getL1Provider()
    const L1_PingPong = instance("PingPong", l1PingPongAddress, L1Provider)
    const L2Provider = getL2Provider()
    const L2_PingPong = instance("PingPong", l2PingPongAddress, L2Provider)

    const l2lastPingTimestampBefore = await L2_PingPong.callStatic.lastPingTimestamp()
    const l1lastPongTimestampBefore = await L1_PingPong.callStatic.lastPongTimestamp()
    console.log(`L2 Last ping timestamp: ${l2lastPingTimestampBefore}`)
    console.log(`L1 Last pong timestamp: ${l1lastPongTimestampBefore}`)

    const shouldSucceed = await L1_PingPong.callStatic.shouldSucceed()
    if (shouldSucceed == true) {
        console.log("Flip L1 shouldSucceed")
        const l1_flip_tx = await L1_PingPong.connect(l1Wallet).flip()
        await l1_flip_tx.wait()
    }
    console.log("Ping from L2...")
    const l2_ping_tx = await L2_PingPong.connect(l2Wallet).ping()
    console.log(`l2_ping_tx tx hash: ${l2_ping_tx.hash}`)
    await l2_ping_tx.wait()

    console.log("Successfully submit ping from L2, now wait for challenge period to pass")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
