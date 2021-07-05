import { config, ethers } from "hardhat"
import { Watcher } from "@eth-optimism/watcher"
import { loadContract } from "@eth-optimism/contracts"
import { instance } from "./utils"

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
    const l1MessengerAddress = conf.l1MessengerAddress
    // L2 messenger address is always the same.
    const l2MessengerAddress = conf.l2MessengerAddress
    // L2 standard bridge address is always the same.
    const l2StandardBridgeAddress = conf.l2StandardBridgeAddress

    const L2_StandardBridge = loadContract("OVM_L2StandardBridge", l2StandardBridgeAddress, l2RpcProvider)

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

    console.log(`L1 ETH balance: ${(await l1Wallet.getBalance()).toString()}`)
    console.log(`L2 ETH balance: ${(await l2Wallet.getBalance()).toString()}`)

    const l2ERC20Address = "0x235d9B4249E9C9D705fAC6E98F7D21E58091220A"
    const L2_ERC20 = instance("ERC20", l2ERC20Address, l2RpcProvider, true)


    // Checking balance
    const withdrawAmount = ethers.utils.parseUnits("10")
    const l2Balance = await L2_ERC20.balanceOf(l1Wallet.address)
    console.log(`Balance on L2: ${l2Balance.toString()}`)
    if (l2Balance.lt(withdrawAmount)) {
        throw new Error("L2 balance not enough")
    }

    console.log("Approving L2 StandardBridge...")
    const approve_l2_erc20_tx = await L2_ERC20.connect(l2Wallet).approve(
        L2_StandardBridge.address,
        withdrawAmount,
        {
            gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        }
    )
    console.log(`approve_l2_erc20_tx L1 tx hash: ${approve_l2_erc20_tx.hash}`)
    await approve_l2_erc20_tx.wait()

    console.log("Withdrawing from L2...")
    const receiverAddress = "0xE3c19B6865f2602f30537309e7f8D011eF99C1E0"
    const withdraw_L2_ERC20_tx = await L2_StandardBridge.connect(l2Wallet).withdrawTo(
        L2_ERC20.address,
        receiverAddress,
        withdrawAmount,
        100000, //L2 gas limit
        "0x", //data
        {
            gasPrice: ethers.utils.parseUnits("0.015", "gwei")
        }
    )
    console.log(`withdraw_L2_ERC20_tx L2 tx hash: ${withdraw_L2_ERC20_tx.hash}`)
    await withdraw_L2_ERC20_tx.wait()
    console.log("Successfully submit withdrawal of ERC20 from L2, now wait for challenge period to pass")

    // console.log("Need to wait for challenge period to end. You can query for withdraw tx receipt later.")
    // Wait for the message to be relayed to L1.
    // console.log("Waiting for withdraw to be relayed to L2...")
    // const [msgHash] = await watcher.getMessageHashesFromL2Tx(withdraw_L2_ERC20_tx.hash)
    // const l2_receipt = await watcher.getL1TransactionReceipt(msgHash)
    // console.log(`withdraw_L1_ERC20_tx L2 tx hash: ${l2_receipt.transactionHash}`)

    // // Checking balance
    // const l1Balance: BigNumber = await L1_ERC20.balanceOf(receiverAddress)
    // console.log(`Balance on L1: ${l1Balance.toString()}`)
    // if (!l1Balance.eq(withdrawAmount)) {
    //     throw new Error("L1 balance does not match")
    // }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
