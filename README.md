# Deposit/Withdrawal on Optimism Kovan and local testnet

- You can use script like `localSimulation` to do a L1 ---deposit--> L2 ---withdrawal--> L1 run in your local environment.
- Or you can also use other scripts to actually do deposit/transfer/withdrawal on both Kovan testnet and Optimisim-Kovan testnet.
    - there's also `L1_L2_cycle` script that runs deposit/withdrawal loop, i.e., L1 ---deposit--> L2 ---withdrawal--> L1 ---> ...
- Finally you can also spin up a worker process and a scanner process which keep monitoring the chains and run deposit/withdrawal loop
## Prerequisite Software

- [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- [Node.js](https://nodejs.org/en/download/)
- [Yarn](https://classic.yarnpkg.com/en/docs/install#mac-stable)
- [Docker](https://docs.docker.com/engine/install/)


## Environment

You need to provide environment variables in `.env` (`.env.example` as template) before running examples on Kovan testnet and Optimism-Kovan testnet. The following are required variables:

`DEPLOYER_PRIVATE_KEY`: Wallet private key for Kovan and Optimism.
`ALCHEMY_TOKEN=`: (optional) Alchemy token for accessing Alchemy endpoint. You can skip it if you are using other endpoint.

## Running the deposit/withdraw scripts in local environment or public testnet

Run the following commands to get started:
NOTE: you can skip `yarn install` if you have previously run `yarn boostrap` in root folder.

```sh
yarn install
yarn compile
```

Next you can choose to either run the example in local environment or public testnet.

### 1. Do a L1 ---deposit--> L2 ---withdrawal--> L1 run in local environment

Make sure you have the local L1/L2 system running (open a second terminal for this):

```sh
git clone git@github.com:ethereum-optimism/optimism.git
cd optimism
yarn
yarn build
cd ops
docker-compose build
docker-compose up
```

Now run the script:

```sh
npx hardhat run scripts/localSimulation.ts --network optimism
```

If everything goes well, you should see the following:

```text
Deploying L1 ERC20...
Deploying L2 ERC20...
Balance on L1: 1234
Balance on L2: 0
Approving tokens for ERC20 standard bridge...
Depositing tokens into L2 ERC20...
Waiting for deposit to be relayed to L2...
Balance on L1: 0
Balance on L2: 1234
Withdrawing tokens back to L1 ERC20...
Waiting for withdrawal to be relayed to L1...
Balance on L1: 1234
Balance on L2: 0
```

### 2. Running deposit/withdrawal loop in public testnet

Run the example file:

```sh
npx hardhat run scripts/L1_L2_cycle.ts --network kovan
```

This script will automatically execute the deposit/withdraw flow in cycle. Since the challenge period is not instant in testnet, you will have to wait for challenge period to end before relaying your withdrawal message. This currently will take 60 seconds in Kovan (see `FRAUD_PROOF_WINDOW` in [StateCommitment Chain](https://kovan.etherscan.io/address/0xa2487713665AC596b0b3E4881417f276834473d2#readContract)).

#### You can also run the deposit/transfer/withdrawal scripts separately

NOTE: parameters like ERC20 amount, ETH amount or transaction hash are currently hardcoded in the scripts, you need to overwrite them with your own parameters.

```sh
npx hardhat run scripts/L1_ETH_deposit.ts --network kovan
npx hardhat run scripts/L1_ERC20_deposit.ts --network kovan
npx hardhat run scripts/L2_ERC20_transfer.ts --network kovan
npx hardhat run scripts/L2_ERC20_withdraw.ts --network kovan
npx hardhat run scripts/L1_relay_L2_messages.ts --network kovan
```

NOTE: `L1_relay_L2_messages` script will relay the L2 withdrawal transaction so you need to provide the transaction hash of your L2 ETH/ERC20 withdraw transaction. And you also need to wait for challenge period to pass before relaying your messages.

## Running worker

Worker includes two services, scanner service and worker service.
- Scanner service will periodically scan through transactions in the file/db and check if any of their status need to be updated, for example, from `Sent` to `Waiting` or `Relayed`.
- Worker service will periodically check if we need to execute next action for the transactions in the file/db, for example, initiate a withdraw if L1 deposit succeeded or initaite a deposit if L2 withdrawal completed.

Before spinning up worker, you can use the deposit or withdraw scripts mentioned above to initiate a deposit or withdraw transaction, this will write the transaction to file/db.

```sh
npx hardhat run scripts/L1_ERC20_deposit.ts --network kovan
npx hardhat run scripts/L2_ERC20_withdraw.ts --network kovan
```

Then you can start the worker(this will also spin up the scanner too):

```sh
yarn execute worker
```
