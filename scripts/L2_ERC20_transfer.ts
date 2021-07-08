import { ethers } from "hardhat"
import { getL2ERC20, getL2Wallet } from "./utils"

async function main() {
    const l2Wallet = getL2Wallet()

    const L2_ERC20 = getL2ERC20()

    const l2ETHBalanceBefore = await l2Wallet.getBalance()
    console.log(`L2 ETH balance before: ${l2ETHBalanceBefore.toString()}`)

    const l2ERC20BalanceBefore = await L2_ERC20.callStatic.balanceOf(l2Wallet.address)
    console.log(`L2 ERC20 balance before: ${l2ERC20BalanceBefore.toString()}`)

    console.log("Transferring L2 ERC20...")
    const receiverAddress = "0xE3c19B6865f2602f30537309e7f8D011eF99C1E0"
    const L2_transfer_ERC20_tx = await L2_ERC20.connect(l2Wallet).transfer(
        receiverAddress,
        ethers.utils.parseUnits("150"),
        {
            gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        }
    )
    console.log(L2_transfer_ERC20_tx.hash)
    await L2_transfer_ERC20_tx.wait()

    const l2ERC20BalanceAfter = await L2_ERC20.callStatic.balanceOf(l2Wallet.address)
    console.log(`L2 ERC20 balance after: ${l2ERC20BalanceAfter.toString()}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
