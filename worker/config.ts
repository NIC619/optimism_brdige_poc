import { utils } from "ethers"

export const BLOCKTIME_SECONDS = 15
export const CHALLENGE_PERIOD_BLOCKS = 60
export const CHALLENGE_PERIOD_SECONDS = CHALLENGE_PERIOD_BLOCKS * BLOCKTIME_SECONDS // 60 blocks for challenge period in Kovan
export const NUM_L2_GENESIS_BLOCKS = 1

export const depositAmount = utils.parseUnits("99", 18)

export const withdrawAmount = depositAmount
