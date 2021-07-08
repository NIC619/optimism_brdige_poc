import { relayL2Message } from "./utils"

async function main() {
    const l2TransactionHash = "0xf5f8d36370b0ead3eea502eb09911ae02c57c90a5b7b88bbf4eb7d73aff77c37"
    await relayL2Message(l2TransactionHash)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
