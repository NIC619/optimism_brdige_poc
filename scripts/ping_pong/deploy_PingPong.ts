import { ethers } from "hardhat"
import { factory, getL1Wallet, getL2Wallet, l1CrossDomainMessengerAddress, l2CrossDomainMessengerAddress } from "../utils"

const factory__L2_PingPong = factory("PingPong", true)

async function main() {
    const l1Wallet = getL1Wallet()
    const l2Wallet = getL2Wallet()

    console.log(`L1 ETH balance: ${(await l1Wallet.getBalance()).toString()}`)
    console.log(`L2 ETH balance: ${(await l2Wallet.getBalance()).toString()}`)

    // Deploying L1 and L2 PingPong
    console.log("Deploying L1 PingPong...")
    const L1_PingPong = await (
        await ethers.getContractFactory("PingPong", l1Wallet)
    ).deploy(l1CrossDomainMessengerAddress)
    await L1_PingPong.deployTransaction.wait()

    console.log("Deploying L2 PingPong...")
    const L2_PingPong = await factory__L2_PingPong.connect(l2Wallet).deploy(
        l2CrossDomainMessengerAddress,
        {
            gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        }
    )
    console.log(`L2 deploy tx hash: ${L2_PingPong.deployTransaction.hash}`)
    await L2_PingPong.deployTransaction.wait()

    // Initialize L1 and L2 PingPong
    console.log("Initializing L1 PingPong...")
    const l1_init_tx = await L1_PingPong.connect(l1Wallet).initialize(
        L2_PingPong.address
    )
    console.log(`l1_init_tx tx hash: ${l1_init_tx.hash}`)
    await l1_init_tx.wait()

    console.log("Initializing L2 PingPong...")
    const l2_init_tx = await L2_PingPong.connect(l2Wallet).initialize(
        L1_PingPong.address,
        {
            gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        }
    )
    console.log(`l2_init_tx tx hash: ${l2_init_tx.hash}`)
    await l2_init_tx.wait()

    // Checking
    const L1_counterPingPongnStored = await L1_PingPong.callStatic.counterPingPong()
    if (L1_counterPingPongnStored !== L2_PingPong.address) {
        throw new Error("L1 counterPingPong address was not correctly set")
    }
    const L2_counterPingPongnStored = await L2_PingPong.callStatic.counterPingPong()
    if (L2_counterPingPongnStored !== L1_PingPong.address) {
        throw new Error("L2 counterPingPong address was not correctly set")
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
