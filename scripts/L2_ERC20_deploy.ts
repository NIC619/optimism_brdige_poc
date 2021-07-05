import { config, ethers } from "hardhat"
import { loadContract } from "@eth-optimism/contracts"
import { factory } from "./utils"

const factory__L2_ERC20 = factory("L2StandardERC20Initializeable", true)

async function main() {
    const conf: any = config.networks.kovan

    // Set up our RPC provider connections.
    const l2RpcProvider = new ethers.providers.JsonRpcProvider(conf.optimismURL)

    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
    if (deployerPrivateKey === undefined) throw Error("Deployer private key not provided")

    const l2Wallet = new ethers.Wallet(deployerPrivateKey, l2RpcProvider)

    // L2 standard bridge address is always the same.
    const l2StandardBridgeAddress = conf.l2StandardBridgeAddress

    const L2_StandardBridge = loadContract("OVM_L2StandardBridge", l2StandardBridgeAddress, l2RpcProvider)

    const l1ERC20Address = "0x0712629Ced85A3A62E5BCa96303b8fdd06CBF8dd" // Kovan LON

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
