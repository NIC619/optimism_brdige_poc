import { ethers } from "hardhat"
import { parse, Transaction } from '@ethersproject/transactions'

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
