import { ethers } from "hardhat"
import { sleep } from "@eth-optimism/core-utils"
import { getCanonicalTransactionChain, getECDSAContractAccount, getL1Wallet, getL2ERC20, getL2Wallet, optimismChainId } from "../scripts/utils"
import { LibEIP155TxStruct } from "../scripts/force_inclusion/utils"

async function main() {
    const l1Wallet = getL1Wallet()
    const l2Wallet = getL2Wallet()
    const ECDSAContractAccount = getECDSAContractAccount()
    const CTC = getCanonicalTransactionChain()

    const L2_ERC20 = getL2ERC20()

    const l2ERC20BalanceBefore = await L2_ERC20.callStatic.balanceOf(l2Wallet.address)
    console.log(`L2 ERC20 balance before: ${l2ERC20BalanceBefore.toString()}`)

    const tx_interval = 120000 // 120 sec
    const nonce = await l2Wallet.getTransactionCount()
    const receiverAddress = "0xE3c19B6865f2602f30537309e7f8D011eF99C1E0"

    // First tx
    console.log("First tx: force inclusion of L2 ERC20 transfer")
    const L2_ETH_transfer_data = L2_ERC20.interface.encodeFunctionData(
        "transfer",
        [receiverAddress, ethers.utils.parseUnits("2")]
    )
    const L2_ETH_transfer_tx = {
        to: L2_ERC20.address,
        nonce: nonce,
        gasLimit: 600000,
        gasPrice: ethers.utils.parseUnits("0.015", "gwei"),
        data: L2_ETH_transfer_data,
        chainId: optimismChainId,
    }
    const encodedTransaction = await l2Wallet.signTransaction(L2_ETH_transfer_tx)
    const L2_EOA_execute_data = ECDSAContractAccount.interface.encodeFunctionData(
        "execute",
        [LibEIP155TxStruct(encodedTransaction)]
    )
    const first_tx = await CTC.connect(l1Wallet).enqueue(
        l2Wallet.address,
        2000000, // L2 gas
        L2_EOA_execute_data
    )
    console.log(`Force inclusion L2 ERC20 transfer L1 tx hash: ${first_tx.hash}`)
    await first_tx.wait()

    await sleep(tx_interval)

    // Second tx
    console.log("Second tx: normal L2 ERC20 transfer")
    const second_tx = await L2_ERC20.connect(l2Wallet).transfer(
        receiverAddress,
        ethers.utils.parseUnits("1"),
        {
            nonce: nonce,
            gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        }
    )
    console.log(`Normal L2 ERC20 transfer tx hash: ${second_tx.hash}`)
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
