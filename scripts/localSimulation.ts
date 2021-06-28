import { ethers } from "hardhat"
import { Watcher } from "@eth-optimism/watcher"
import { getContractFactory, loadContract } from "@eth-optimism/contracts"
import { factory } from "./utils"

const factory__L1_ERC20 = factory('ERC20')
const factory__L2_ERC20 = getContractFactory('L2StandardERC20', undefined, true)

async function main() {
    // Set up our RPC provider connections.
    const l1RpcProvider = new ethers.providers.JsonRpcProvider('http://localhost:9545')
    const l2RpcProvider = new ethers.providers.JsonRpcProvider('http://localhost:8545')

    // Set up our wallets (using a default private key with 10k ETH allocated to it).
    // Need two wallets objects, one for interacting with L1 and one for interacting with L2.
    // Both will use the same private key.
    const key = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    const l1Wallet = new ethers.Wallet(key, l1RpcProvider)
    const l2Wallet = new ethers.Wallet(key, l2RpcProvider)

    // L1 messenger address depends on the deployment, this is default for our local deployment.
    const l1MessengerAddress = '0x59b670e9fA9D0A427751Af201D676719a970857b'
    // L1 standard bridge address depends on the deployment, this is default for our local deployment.
    const l1StandardBridgeAddress = '0x851356ae760d987E095750cCeb3bC6014560891C'
    // L2 messenger address is always the same.
    const l2MessengerAddress = '0x4200000000000000000000000000000000000007'
    // L2 standard bridge address is always the same.
    const l2StandardBridgeAddress = '0x4200000000000000000000000000000000000010'

    const L1_StandardBridge = loadContract('OVM_L1StandardBridge', l1StandardBridgeAddress, l1RpcProvider)
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

    // Deploy an ERC20 token on L1.
    console.log('Deploying L1 ERC20...')
    const L1_ERC20 = await factory__L1_ERC20.connect(l1Wallet).deploy(
        1234, //initialSupply
        'L1 ERC20', //name
    )
    await L1_ERC20.deployTransaction.wait()

    // Deploy the paired ERC20 token to L2.
    console.log('Deploying L2 ERC20...')
    const L2_ERC20 = await factory__L2_ERC20.connect(l2Wallet).deploy(
        L2_StandardBridge.address,
        L1_ERC20.address,
        'L2 ERC20', //name
        'L2ERC20', //symbol
        {
            gasPrice: 0
        }
    )
    await L2_ERC20.deployTransaction.wait()

    // Checking L2 ERC20
    const erc20L1TokenStored = await L2_ERC20.callStatic.l1Token()
    if (erc20L1TokenStored !== L1_ERC20.address) {
        throw new Error('L1 ERC20 token address was not correctly set')
    }
    const erc20L2TokenBridgeStored = await L2_ERC20.callStatic.l2Bridge()
    if (erc20L2TokenBridgeStored !== L2_StandardBridge.address) {
        throw new Error('L2 bridge address was not correctly set')
    }

    // Initial balances.
    console.log(`Balance on L1: ${await L1_ERC20.balanceOf(l1Wallet.address)}`) // 1234
    console.log(`Balance on L2: ${await L2_ERC20.balanceOf(l1Wallet.address)}`) // 0

    // Allow the standard bridge to lock up some of our tokens.
    console.log('Approving tokens for ERC20 standard bridge...')
    const approve_L1_ERC20_tx = await L1_ERC20.approve(L1_StandardBridge.address, 1234)
    await approve_L1_ERC20_tx.wait()

    // Lock the tokens up inside the standard bridge and ask the L2 contract to mint new ones.
    console.log('Depositing tokens into L2 ERC20...')
    const deposit_L1_ERC20_tx = await L1_StandardBridge.connect(l1Wallet).depositERC20(
        L1_ERC20.address,
        L2_ERC20.address,
        1234,
        2000000, //L2 gas limit
        '0x' //data
    )
    await deposit_L1_ERC20_tx.wait()

    // Wait for the message to be relayed to L2.
    console.log('Waiting for deposit to be relayed to L2...')
    const [msgHash1] = await watcher.getMessageHashesFromL1Tx(deposit_L1_ERC20_tx.hash)
    await watcher.getL2TransactionReceipt(msgHash1)

    // Log some balances to see that it worked!
    console.log(`Balance on L1: ${await L1_ERC20.balanceOf(l1Wallet.address)}`) // 0
    console.log(`Balance on L2: ${await L2_ERC20.balanceOf(l1Wallet.address)}`) // 1234

    // Burn the tokens on L2 and ask the L1 contract to unlock on our behalf.
    console.log(`Withdrawing tokens back to L1 ERC20...`)
    const withdraw_L2_ERC20_tx = await L2_StandardBridge.connect(l2Wallet).withdraw(
        L2_ERC20.address,
        1234,
        2000000, //L1 gas limit
        '0x', //data
        {
            gasPrice: 0
        }
    )
    await withdraw_L2_ERC20_tx.wait()

    // Wait for the message to be relayed to L1.
    console.log(`Waiting for withdrawal to be relayed to L1...`)
    const [msgHash2] = await watcher.getMessageHashesFromL2Tx(withdraw_L2_ERC20_tx.hash)
    await watcher.getL1TransactionReceipt(msgHash2)

    // Log balances again!
    console.log(`Balance on L1: ${await L1_ERC20.balanceOf(l1Wallet.address)}`) // 1234
    console.log(`Balance on L2: ${await L2_ERC20.balanceOf(l1Wallet.address)}`) // 0
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
