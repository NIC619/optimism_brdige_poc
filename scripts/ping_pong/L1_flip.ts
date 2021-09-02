import { getL1Provider, getL1Wallet, getL2Wallet, instance } from "../utils"
import { l1PingPongAddress } from "./utils"

async function main() {
    const l1Wallet = getL1Wallet()
    const l2Wallet = getL2Wallet()

    console.log(`L1 ETH balance: ${(await l1Wallet.getBalance()).toString()}`)
    console.log(`L2 ETH balance: ${(await l2Wallet.getBalance()).toString()}`)
    const L1Provider = getL1Provider()
    const L1_PingPong = instance("PingPong", l1PingPongAddress, L1Provider)

    const shouldSucceed = await L1_PingPong.callStatic.shouldSucceed()
    console.log(`Flip before: ${shouldSucceed}`)
    console.log("Flip L1 shouldSucceed")
    const l1_flip_tx = await L1_PingPong.connect(l1Wallet).flip()
    await l1_flip_tx.wait()
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
