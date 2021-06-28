import { ethers } from "hardhat"
import { instance } from "./utils"

async function main() {
    // Set up our RPC provider connections.
    const l2RpcProvider = new ethers.providers.JsonRpcProvider('https://kovan.optimism.io')

    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
    if (deployerPrivateKey === undefined) throw Error("Deployer private key not provided")

    const l2Wallet = new ethers.Wallet(deployerPrivateKey, l2RpcProvider)

    const l2ETHBalanceBefore = await l2Wallet.getBalance()
    console.log(`L2 ETH balance before: ${l2ETHBalanceBefore.toString()}`)

    const l2ERC20Address = '0xeaBF2eF921D2295f14b2bB80aF937E64D3320B47'
    const L2_ERC20 = instance('ERC20', l2ERC20Address, l2RpcProvider, true)
    console.log(L2_ERC20)
    const l2ERC20BalanceBefore = await L2_ERC20.callStatic.balanceOf(l2Wallet.address)
    console.log(`L2 ERC20 balance before: ${l2ERC20BalanceBefore.toString()}`)

    // Deploy the paired ERC20 token to L2.
    console.log('Transferring L2 ERC20...')
    const receiverAddress = '0xE3c19B6865f2602f30537309e7f8D011eF99C1E0'
    const L2_transfer_ERC20_tx = await L2_ERC20.connect(l2Wallet).transfer(
        receiverAddress,
        ethers.utils.parseUnits('100'),
        {
            gasPrice: 0
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
