import { ethers } from "hardhat"
import { parse, Transaction } from '@ethersproject/transactions'
import { getCanonicalTransactionChain, getECDSAContractAccount, getL1Wallet, getL2ERC20, getL2Wallet, l2ETHAddress, optimismChainId } from "../utils"

// Borrowed from optimism test helpers
export const LibEIP155TxStruct = (tx: Transaction | string): Array<any> => {
    if (typeof tx === 'string') {
      tx = parse(tx)
    }
    const values = [
      tx.nonce,
      tx.gasPrice,
      tx.gasLimit,
      tx.to ? tx.to : ethers.constants.AddressZero,
      tx.value,
      tx.data,
      tx.v! % 256,
      tx.r,
      tx.s,
      tx.chainId,
      tx.v === 0 ? 0 : tx.v! - 2 * tx.chainId - 35,
      tx.to === null,
    ]
    return values
}

async function main() {
    const l1Wallet = getL1Wallet()
    const l2Wallet = getL2Wallet()
    const ECDSAContractAccount = getECDSAContractAccount()
    const CTC = getCanonicalTransactionChain()

    const L2_ERC20 = getL2ERC20()

    const l2ETHBalanceBefore = await l2Wallet.getBalance()
    console.log(`L2 ETH balance before: ${l2ETHBalanceBefore.toString()}`)
    console.log("Forcing inclusion of L2 ETH transfer...")
    const receiverAddress = "0xE3c19B6865f2602f30537309e7f8D011eF99C1E0"
    const L2_ETH_transfer_data = L2_ERC20.interface.encodeFunctionData(
        "transfer",
        [receiverAddress, ethers.utils.parseUnits("0.01")]
    )
    const L2_ETH_transfer_tx = {
        to: l2ETHAddress,
        nonce: await l2Wallet.getTransactionCount(),
        gasLimit: 1000000,
        gasPrice: ethers.utils.parseUnits("0.015", "gwei"),
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
