import { ethers } from "hardhat"
import { relayL2Message } from "./utils"

async function main() {
    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
    if (deployerPrivateKey === undefined) throw Error("Deployer private key not provided")

    const l1Wallet = new ethers.Wallet(deployerPrivateKey, ethers.provider)

    const l2TransactionHash = "0xf5f8d36370b0ead3eea502eb09911ae02c57c90a5b7b88bbf4eb7d73aff77c37"
    await relayL2Message(l2TransactionHash, l1Wallet)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
