import { config, ethers } from "hardhat"
import { Watcher } from "@eth-optimism/watcher"
import { loadContract } from "@eth-optimism/contracts"
import { BigNumber } from "ethers"
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
    const l1MessengerAddress = conf.l1MessengerAddress // Kovan
    // L1 standard bridge address depends on the deployment.
    const l1StandardBridgeAddress = conf.l1StandardBridgeAddress // Kovan
    // L2 messenger address is always the same.
    const l2MessengerAddress = conf.l2MessengerAddress

    const L1_StandardBridge = loadContract("OVM_L1StandardBridge", l1StandardBridgeAddress, l1RpcProvider)

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

    const l1ERC20Address = "0x0712629Ced85A3A62E5BCa96303b8fdd06CBF8dd" // Kovan LON
    const L1_ERC20 = instance("ERC20", l1ERC20Address, l1RpcProvider)
    const l2ERC20Address = "0x235d9B4249E9C9D705fAC6E98F7D21E58091220A"
    const L2_ERC20 = instance("ERC20", l2ERC20Address, l2RpcProvider, true)


    // Checking balance
    const depositAmount = ethers.utils.parseUnits("500")
    const l1Balance = await L1_ERC20.balanceOf(l1Wallet.address)
    console.log(`ERC20 Balance on L1: ${l1Balance.toString()}`)
    if (l1Balance.lt(depositAmount)) {
        throw new Error("L1 balance not enough")
    }

    console.log("Approving L1 StandardBridge...")
    const approve_l1_erc20_tx = await L1_ERC20.connect(l1Wallet).approve(L1_StandardBridge.address, depositAmount)
    console.log(`approve_l1_erc20_tx L1 tx hash: ${approve_l1_erc20_tx.hash}`)
    await approve_l1_erc20_tx.wait()

    console.log("Depositing into L1 Standard Bridge...")
    const receiverAddress = "0xE3c19B6865f2602f30537309e7f8D011eF99C1E0"
    const deposit_L1_ERC20_tx = await L1_StandardBridge.connect(l1Wallet).depositERC20To(
        L1_ERC20.address,
        L2_ERC20.address,
        receiverAddress,
        depositAmount,
        2000000, //L2 gas limit
        "0x" //data
    )
    console.log(`deposit_L1_ERC20_tx L1 tx hash: ${deposit_L1_ERC20_tx.hash}`)
    await deposit_L1_ERC20_tx.wait()

    // Wait for the message to be relayed to L2.
    console.log("Waiting for deposit to be relayed to L2...")
    const [msgHash] = await watcher.getMessageHashesFromL1Tx(deposit_L1_ERC20_tx.hash)
    const l2_receipt = await watcher.getL2TransactionReceipt(msgHash)
    console.log(`deposit_L1_ERC20_tx L2 tx hash: ${l2_receipt.transactionHash}`)

    // Checking balance
    const l2Balance: BigNumber = await L2_ERC20.balanceOf(receiverAddress)
    console.log(`ERC20 Balance on L2: ${l2Balance.toString()}`)
    if (!l2Balance.gte(depositAmount)) {
        throw new Error("L2 balance does not match")
    }
    console.log("Successfully deposit ERC20 from L1")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
