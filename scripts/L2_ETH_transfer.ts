import { ethers } from "hardhat"
import { getL2ETH, getL2Wallet } from "./utils"

async function main() {
    const l2Wallet = getL2Wallet()

    const L2_ETH = getL2ETH()

    const l2ETHBalanceBefore = await l2Wallet.getBalance()
    console.log(`L2 ETH balance before: ${l2ETHBalanceBefore.toString()}`)

    console.log("Transferring L2 ETH...")
    const receiverAddress = "0xE3c19B6865f2602f30537309e7f8D011eF99C1E0"
    const L2_transfer_ETH_tx = await L2_ETH.connect(l2Wallet).transfer(
        receiverAddress,
        ethers.utils.parseUnits("0.01")
    )
    console.log(L2_transfer_ETH_tx.hash)
    await L2_transfer_ETH_tx.wait()

    const l2ETHBalanceAfter = await L2_ETH.callStatic.balanceOf(l2Wallet.address)
    console.log(`L2 ETH balance after: ${l2ETHBalanceAfter.toString()}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
