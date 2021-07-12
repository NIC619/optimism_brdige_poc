import schedule from "node-schedule"
import watcher from "./watcher"
import scanner from "./scanner"
import worker from "./worker"

async function main() {
    // await watcher()
    await scanner()
    await worker()
    schedule.scheduleJob("*/1 * * * *", scanner)
    schedule.scheduleJob("*/3 * * * *", worker)
}

main()