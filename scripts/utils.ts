import { ethers } from "hardhat"

export const factory = (name, ovm = false) => {
    const artifact = require(`~/artifacts${ovm ? '-ovm' : ''}/contracts/${name}.sol/${name}.json`)
    return new ethers.ContractFactory(artifact.abi, artifact.bytecode)
}

export const instance = (name, address, provider?, ovm = false) => {
    const artifact = require(`~/artifacts${ovm ? '-ovm' : ''}/contracts/${name}.sol/${name}.json`)
    return new ethers.Contract(address, artifact.abi, provider)
}