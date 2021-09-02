import { getL1Provider, getL2Provider, instance } from "../utils"
import { l1PingPongAddress, l2PingPongAddress } from "./utils"

async function main() {
    const L1Provider = getL1Provider()
    const L1_PingPong = instance("PingPong", l1PingPongAddress, L1Provider)
    const L2Provider = getL2Provider()
    const L2_PingPong = instance("PingPong", l2PingPongAddress, L2Provider)

    const l1lastPingTimestamp = await L1_PingPong.callStatic.lastPingTimestamp()
    const l1lastPongTimestamp = await L1_PingPong.callStatic.lastPongTimestamp()
    console.log(`L1 Last ping timestamp: ${l1lastPingTimestamp}`)
    console.log(`L1 Last pong timestamp: ${l1lastPongTimestamp}`)

    const l2lastPingTimestamp = await L2_PingPong.callStatic.lastPingTimestamp()
    const l2lastPongTimestamp = await L2_PingPong.callStatic.lastPongTimestamp()
    console.log(`L2 Last ping timestamp: ${l2lastPingTimestamp}`)    
    console.log(`L2 Last pong timestamp: ${l2lastPongTimestamp}`)    
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
