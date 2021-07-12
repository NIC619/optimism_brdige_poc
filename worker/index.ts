import schedule from "node-schedule"
import watcher from "./watcher"
import worker from "./worker"

async function main() {
    await watcher()
    await worker()
    schedule.scheduleJob("*/3 * * * *", worker)
}

main()