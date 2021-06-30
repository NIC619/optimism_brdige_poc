import { config, ethers } from "hardhat"
import { Watcher } from "@eth-optimism/watcher"
import { loadContract } from "@eth-optimism/contracts"

async function main() {
    const conf: any = config.networks.kovan

    // Set up our RPC provider connections.
    const l1RpcProvider = ethers.provider
    const l2RpcProvider = new ethers.providers.JsonRpcProvider(conf.optimismURL)

    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
    if (deployerPrivateKey === undefined) throw Error("Deployer private key not provided")

    const l1Wallet = new ethers.Wallet(deployerPrivateKey, ethers.provider)
    const l2Wallet = new ethers.Wallet(deployerPrivateKey, l2RpcProvider)

    // L1 messenger address depends on the deployment.
    const l1MessengerAddress = conf.l1MessengerAddress // Kovan
    // L1 standard bridge address depends on the deployment.
    const l1StandardBridgeAddress = conf.l1StandardBridgeAddress // Kovan
    // L2 messenger address is always the same.
    const l2MessengerAddress = conf.l2MessengerAddress

    const L1_StandardBridge = loadContract('OVM_L1StandardBridge', l1StandardBridgeAddress, l1RpcProvider)

    // Tool that helps watches and waits for messages to be relayed between L1 and L2.
    const watcher = new Watcher({
        l1: {
            provider: l1RpcProvider,
            messengerAddress: l1MessengerAddress
        },
        l2: {
            provider: l2RpcProvider,
            messengerAddress: l2MessengerAddress
        }
    })

    // Deploy the paired ERC20 token to L2.
    console.log('Depositing L1 ETH...')
    const l2ETHBalanceBefore = await l2Wallet.getBalance()
    console.log(`L2 ETH balance before: ${l2ETHBalanceBefore.toString()}`)
    const L1_ETH_deposit_tx = await L1_StandardBridge.connect(l1Wallet).depositETH(
        2000000, // L2 gas
        '0x',
        {
            value: ethers.utils.parseUnits('1')
        }
    )
    console.log(`L1_ETH_deposit_tx L1 tx hash: ${L1_ETH_deposit_tx.hash}`)
    await L1_ETH_deposit_tx.wait()

    const [msgHash] = await watcher.getMessageHashesFromL1Tx(L1_ETH_deposit_tx.hash)
    const l2_receipt = await watcher.getL2TransactionReceipt(msgHash)
    console.log(`L1_ETH_deposit_tx L2 tx hash: ${l2_receipt.transactionHash}`)

    const l2ETHBalanceAfter = await l2Wallet.getBalance()
    console.log(`L2 ETH balance afer: ${l2ETHBalanceAfter.toString()}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
