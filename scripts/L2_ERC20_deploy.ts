import { ethers } from "hardhat"
import { factory } from "./utils"
import { getL1Wallet, getL2StandardBridge, getL2Wallet, l1ERC20Address } from "./utils"

const factory__L2_ERC20 = factory("L2StandardERC20Initializeable", true)

async function main() {
    const l1Wallet = getL1Wallet()
    const l2Wallet = getL2Wallet()
    const L2_StandardBridge = getL2StandardBridge()

    console.log(`L1 ETH balance: ${(await l1Wallet.getBalance()).toString()}`)
    console.log(`L2 ETH balance: ${(await l2Wallet.getBalance()).toString()}`)

    const l2ETHBalanceBefore = await l2Wallet.getBalance()
    console.log(`L2 ETH balance before: ${l2ETHBalanceBefore.toString()}`)

    // Deploy the paired ERC20 token to L2.
    console.log("Deploying L2 ERC20...")
    const L2_ERC20 = await factory__L2_ERC20.connect(l2Wallet).deploy(
        L2_StandardBridge.address,
        "L2 Testing LON", //name
        "L2TL", //symbol
        {
            gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        }
    )
    console.log(`L2 deploy tx hash: ${L2_ERC20.deployTransaction.hash}`)
    await L2_ERC20.deployTransaction.wait()

    console.log("Initializing L2 ERC20...")
    const init_tx = await L2_ERC20.connect(l2Wallet).initialize(
        l1ERC20Address,
        {
            gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        }
    )
    console.log(`init_tx L2 tx hash: ${init_tx.hash}`)
    await init_tx.wait()

    // Checking L2 ERC20
    const erc20L1TokenStored = await L2_ERC20.callStatic.l1Token()
    if (erc20L1TokenStored !== l1ERC20Address) {
        throw new Error("L1 ERC20 token address was not correctly set")
    }
    const erc20L2TokenBridgeStored = await L2_ERC20.callStatic.l2Bridge()
    if (erc20L2TokenBridgeStored !== L2_StandardBridge.address) {
        throw new Error("L2 bridge address was not correctly set")
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
