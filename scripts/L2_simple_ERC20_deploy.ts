import { ethers } from "hardhat"
import { getContractFactory, loadContract } from "@eth-optimism/contracts"

// Set up some contract factories. You can ignore this stuff.
const factory = (name, ovm = false) => {
    const artifact = require(`~/artifacts${ovm ? '-ovm' : ''}/contracts/${name}.sol/${name}.json`)
    return new ethers.ContractFactory(artifact.abi, artifact.bytecode)
}
const factory__L2_ERC20 = factory('ERC20', true)

async function main() {
    // Set up our RPC provider connections.
    const l2RpcProvider = new ethers.providers.JsonRpcProvider('https://kovan.optimism.io')

    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
    if (deployerPrivateKey === undefined) throw Error("Deployer private key not provided")

    const l2Wallet = new ethers.Wallet(deployerPrivateKey, l2RpcProvider)

    const l2ETHBalanceBefore = await l2Wallet.getBalance()
    console.log(`L2 ETH balance before: ${l2ETHBalanceBefore.toString()}`)

    // Deploy the paired ERC20 token to L2.
    console.log('Deploying L2 ERC20...')
    const L2_ERC20 = await factory__L2_ERC20.connect(l2Wallet).deploy(
        ethers.utils.parseUnits('999'),
        'L2 Testing LON', //name
        {
            gasPrice: 0
        }
    )
    console.log(L2_ERC20.deployTransaction.hash)
    await L2_ERC20.deployTransaction.wait()
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
