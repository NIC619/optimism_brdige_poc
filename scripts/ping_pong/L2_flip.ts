import { getL1Wallet, getL2Provider, getL2Wallet, instance } from "../utils"
import { l2PingPongAddress } from "./utils"

async function main() {
    const l1Wallet = getL1Wallet()
    const l2Wallet = getL2Wallet()

    console.log(`L1 ETH balance: ${(await l1Wallet.getBalance()).toString()}`)
    console.log(`L2 ETH balance: ${(await l2Wallet.getBalance()).toString()}`)
    const L2Provider = getL2Provider()
    const L2_PingPong = instance("PingPong", l2PingPongAddress, L2Provider)

    const shouldSucceed = await L2_PingPong.callStatic.shouldSucceed()
    console.log(`Flip before: ${shouldSucceed}`)
    console.log("Flip L2 shouldSucceed")
    const l2_flip_tx = await L2_PingPong.connect(l1Wallet).flip()
    await l2_flip_tx.wait()
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
