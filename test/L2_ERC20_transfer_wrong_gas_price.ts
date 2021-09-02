import { ethers } from "hardhat"
import { getCanonicalTransactionChain, getECDSAContractAccount, getL1Wallet, getL2ERC20, getL2Wallet, l2ETHAddress, optimismChainId } from "../scripts/utils"
import { LibEIP155TxStruct } from "../scripts/force_inclusion/utils"

async function main() {
    const l1Wallet = getL1Wallet()
    const l2Wallet = getL2Wallet()
    const ECDSAContractAccount = getECDSAContractAccount()
    const CTC = getCanonicalTransactionChain()

    const L2_ERC20 = getL2ERC20()

    const l2ETHBalanceBefore = await l2Wallet.getBalance()
    console.log(`L2 ETH balance before: ${l2ETHBalanceBefore.toString()}`)
    console.log("Forcing inclusion of L2 ERC20 transfer...")
    const receiverAddress = "0xE3c19B6865f2602f30537309e7f8D011eF99C1E0"
    const L2_ETH_transfer_data = L2_ERC20.interface.encodeFunctionData(
        "transfer",
        [receiverAddress, ethers.utils.parseUnits("1")]
    )
    const L2_ETH_transfer_tx = {
        to: L2_ERC20.address,
        nonce: await l2Wallet.getTransactionCount(),
        gasLimit: 600000,
        // gasPrice 0 will work since gas fee is charged in L1 CTC contract
        gasPrice: 0,
        data: L2_ETH_transfer_data,
        chainId: optimismChainId,
    }
    const encodedTransaction = await l2Wallet.signTransaction(L2_ETH_transfer_tx)
    const L2_EOA_execute_data = ECDSAContractAccount.interface.encodeFunctionData(
        "execute",
        [LibEIP155TxStruct(encodedTransaction)]
    )
    const L2_ETH_transfer_force_inclusion_tx = await CTC.connect(l1Wallet).enqueue(
        l2Wallet.address,
        2000000, // L2 gas
        L2_EOA_execute_data
    )
    console.log(`L2_ETH_transfer_force_inclusion_tx L1 tx hash: ${L2_ETH_transfer_force_inclusion_tx.hash}`)
    await L2_ETH_transfer_force_inclusion_tx.wait()

    // TODO: currently there's no way to monitor force inclusion tx
    // const l2ETHBalanceAfter = await l2Wallet.getBalance()
    // console.log(`L2 ETH balance afer: ${l2ETHBalanceAfter.toString()}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
