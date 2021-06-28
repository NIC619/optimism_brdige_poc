import { ethers } from "hardhat"
import { Watcher } from "@eth-optimism/watcher"
import { loadContract } from "@eth-optimism/contracts"
import { BigNumber } from "ethers"
import { instance } from "./utils"

async function main() {
    // Set up our RPC provider connections.
    const l1RpcProvider = ethers.provider
    const l2RpcProvider = new ethers.providers.JsonRpcProvider('https://kovan.optimism.io')

    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
    if (deployerPrivateKey === undefined) throw Error("Deployer private key not provided")

    const l1Wallet = new ethers.Wallet(deployerPrivateKey, ethers.provider)
    const l2Wallet = new ethers.Wallet(deployerPrivateKey, l2RpcProvider)

    // L1 messenger address depends on the deployment.
    const l1MessengerAddress = '0x4361d0F75A0186C05f971c566dC6bEa5957483fD' // Kovan
    // L2 messenger address is always the same.
    const l2MessengerAddress = '0x4200000000000000000000000000000000000007'
    // L2 standard bridge address is always the same.
    const l2StandardBridgeAddress = '0x4200000000000000000000000000000000000010'

    const L2_StandardBridge = loadContract('OVM_L2StandardBridge', l2StandardBridgeAddress, l2RpcProvider)

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

    const l1ERC20Address = '0x0712629Ced85A3A62E5BCa96303b8fdd06CBF8dd' // Kovan LON
    const L1_ERC20 = await ethers.getContractAt('@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20', l1ERC20Address)
    const l2ERC20Address = '0x235d9B4249E9C9D705fAC6E98F7D21E58091220A'
    const L2_ERC20 = instance('ERC20', l2ERC20Address, l2RpcProvider, true)


    // Checking balance
    const withdrawAmount = ethers.utils.parseUnits('50')
    const l2Balance = await L2_ERC20.balanceOf(l1Wallet.address)
    console.log(`Balance on L2: ${l2Balance.toString()}`)
    if (l2Balance.lt(withdrawAmount)) {
        throw new Error('L2 balance not enough')
    }

    console.log('Approving L2 StandardBridge...')
    const approve_l2_erc20_tx = await L2_ERC20.connect(l2Wallet).approve(
        L2_StandardBridge.address,
        withdrawAmount,
        {
            gasPrice: 0
        }
    )
    console.log(`approve_l2_erc20_tx L1 tx hash: ${approve_l2_erc20_tx.hash}`)
    await approve_l2_erc20_tx.wait()

    console.log('Withdrawing from L2...')
    const receiverAddress = '0xE3c19B6865f2602f30537309e7f8D011eF99C1E0'
    const withdraw_L2_ERC20_tx = await L2_StandardBridge.connect(l2Wallet).withdrawTo(
        L2_ERC20.address,
        receiverAddress,
        withdrawAmount,
        100000, //L2 gas limit
        '0x', //data
        {
            gasPrice: 0
        }
    )
    console.log(`withdraw_L2_ERC20_tx L2 tx hash: ${withdraw_L2_ERC20_tx.hash}`)
    await withdraw_L2_ERC20_tx.wait()

    // console.log('Need to wait for challenge period to end. You can query for withdraw tx receipt later.')
    // Wait for the message to be relayed to L1.
    // console.log('Waiting for withdraw to be relayed to L2...')
    // const [msgHash] = await watcher.getMessageHashesFromL2Tx(withdraw_L2_ERC20_tx.hash)
    // const l2_receipt = await watcher.getL1TransactionReceipt(msgHash)
    // console.log(`withdraw_L1_ERC20_tx L2 tx hash: ${l2_receipt.transactionHash}`)

    // // Checking balance
    // const l1Balance: BigNumber = await L1_ERC20.balanceOf(receiverAddress)
    // console.log(`Balance on L1: ${l1Balance.toString()}`)
    // if (!l1Balance.eq(withdrawAmount)) {
    //     throw new Error('L1 balance does not match')
    // }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
