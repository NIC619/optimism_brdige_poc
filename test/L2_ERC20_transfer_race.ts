import { ethers } from "hardhat"
import { sleep } from "@eth-optimism/core-utils"
import { getL2ERC20, getL2Wallet } from "../scripts/utils"

async function main() {
    const l2Wallet = getL2Wallet()

    const L2_ERC20 = getL2ERC20()

    const l2ERC20BalanceBefore = await L2_ERC20.callStatic.balanceOf(l2Wallet.address)
    console.log(`L2 ERC20 balance before: ${l2ERC20BalanceBefore.toString()}`)

    const tx_interval = 1000 // 1 sec
    const nonce = await l2Wallet.getTransactionCount()

    // First tx
    console.log("First tx")
    const receiverAddress = "0xE3c19B6865f2602f30537309e7f8D011eF99C1E0"
    const first_tx = await L2_ERC20.connect(l2Wallet).transfer(
        receiverAddress,
        ethers.utils.parseUnits("1"),
        {
            nonce: nonce,
            gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        }
    )
    console.log(`First tx hash: ${first_tx.hash}`)

    await sleep(tx_interval)

    // Second tx
    console.log("Second tx")
    const second_tx = await L2_ERC20.connect(l2Wallet).transfer(
        receiverAddress,
        ethers.utils.parseUnits("1"),
        {
            nonce: nonce,
            // Currently Optimism force gas price to be 0.015 Gwei
            gasPrice: ethers.utils.parseUnits("0.02", "gwei")
        }
    )
    console.log(`Second tx hash: ${second_tx.hash}`)

    await first_tx.wait()
    await second_tx.wait()

    const l2ERC20BalanceAfter = await L2_ERC20.callStatic.balanceOf(l2Wallet.address)
    console.log(`L2 ERC20 balance after: ${l2ERC20BalanceAfter.toString()}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
