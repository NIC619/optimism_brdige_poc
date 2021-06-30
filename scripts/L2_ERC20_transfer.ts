import { config, ethers } from "hardhat"
import { instance } from "./utils"

async function main() {
    const conf: any = config.networks.kovan

    // Set up our RPC provider connections.
    const l2RpcProvider = new ethers.providers.JsonRpcProvider(conf.optimismURL)

    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
    if (deployerPrivateKey === undefined) throw Error("Deployer private key not provided")

    const l2Wallet = new ethers.Wallet(deployerPrivateKey, l2RpcProvider)

    const l2ETHBalanceBefore = await l2Wallet.getBalance()
    console.log(`L2 ETH balance before: ${l2ETHBalanceBefore.toString()}`)

    const l2ERC20Address = '0x235d9B4249E9C9D705fAC6E98F7D21E58091220A'
    const L2_ERC20 = instance('ERC20', l2ERC20Address, l2RpcProvider, true)
    const l2ERC20BalanceBefore = await L2_ERC20.callStatic.balanceOf(l2Wallet.address)
    console.log(`L2 ERC20 balance before: ${l2ERC20BalanceBefore.toString()}`)

    console.log('Transferring L2 ERC20...')
    const receiverAddress = '0xE3c19B6865f2602f30537309e7f8D011eF99C1E0'
    const L2_transfer_ERC20_tx = await L2_ERC20.connect(l2Wallet).transfer(
        receiverAddress,
        ethers.utils.parseUnits('150'),
        {
            gasPrice: ethers.utils.parseUnits('0.015', 'gwei')
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
