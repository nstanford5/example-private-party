import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';// this was removed
import { randomBytes } from 'node:crypto';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
    createUnprovenDeployTx,
    deployContract,
    submitCallTx,
} from '@midnight-ntwrk/midnight-js-contracts';
import type { ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { sampleUserAddress, encodeCoinPublicKey } from '@midnight-ntwrk/compact-runtime';
import pino from 'pino';

import { getConfig } from '../config.js';
import { MidnightWalletProvider, syncWallet } from '../wallet.js';
import { buildProviders, type PartyProviders } from '../providers.js';
import {
    CompiledPartyContract,
    createPartyPrivateState,
    ledger,
    PartyState,
    zkConfigPath
} from '../../contract/index.js';
import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import type { CoinPublicKey } from '@midnight-ntwrk/ledger-v8';

// Genesis seed for local dev node — pre-funded with tokens
const LOCAL_DEV_SEED =
  '0000000000000000000000000000000000000000000000000000000000000001';

const PRIVATE_STATE_ID = 'PartyPrivateState';
const BOB_PRIVATE_STATE_ID = 'BobPartyPrivateState';

const logger = pino({
    level: process.env['LOG_LEVEL'] ?? 'info',
    transport: { target: 'pino-pretty' },
});

describe('Raffle Smart Contract via midnight-js', () => {
    let wallet: MidnightWalletProvider;
    let bobWallet: MidnightWalletProvider;
    let providers: PartyProviders;
    let contractAddress: ContractAddress;
    let bobProviders: PartyProviders;

    const config = getConfig();
    const seed = LOCAL_DEV_SEED;
    const seed2 = '0000000000000000000000000000000000000000000000000000000000000002';

    // setup before tests
    beforeAll(async () => {

        setNetworkId(config.networkId);
        
        const envConfig: EnvironmentConfiguration = {
        walletNetworkId: config.networkId,
        networkId: config.networkId,
        indexer: config.indexer,
        indexerWS: config.indexerWS,
        node: config.node,
        nodeWS: config.nodeWS,
        faucet: config.faucet,
        proofServer: config.proofServer,
        };

        wallet = await MidnightWalletProvider.build(logger, envConfig, seed!);
        await wallet.start();
        await syncWallet(logger, wallet.wallet, 600_000);

        bobWallet = await MidnightWalletProvider.build(logger, envConfig, seed2!);
        await bobWallet.start();
        await syncWallet(logger, bobWallet.wallet, 600_000);

        providers = buildProviders(wallet, zkConfigPath, config);
        logger.info('Providers initialized. Ready to test.');

        bobProviders = buildProviders(bobWallet, zkConfigPath, config);
        logger.info(`Bob providers successfully initialized`);
    });

    afterAll(async () => {
        if(wallet) {
            logger.info('Stopping wallet...');
            await wallet.stop();
        }
    });

    it('Runs the contract', async () => {
        const aliceAddress = sampleUserAddress();
        const initialPrivateState = createPartyPrivateState(aliceAddress, randomBytes(32));
        const bobPrivateState = createPartyPrivateState(sampleUserAddress(), randomBytes(32));
        // Step 1: Local circuit execution
        const unprovenData: any = await (createUnprovenDeployTx as any)(providers, {
            compiledContract: CompiledPartyContract,
            privateStateId: PRIVATE_STATE_ID,
            initialPrivateState,
            args: [] // @TODO -- This is the constructor args
            });
        const pendingAddress = unprovenData.public?.contractAddress;
        logger.info(`Unproven tx created. Pending contract address: ${pendingAddress}`);

        // Step 2: Prove (send to proof server, get ZK proof back)
        const provenTx = await providers.proofProvider.proveTx(unprovenData.private.unprovenTx);
        logger.info('proven tx received from proof server');

        // Step 3: Balance wallet
        const balancedTx = await providers.walletProvider.balanceTx(provenTx);
        logger.info('Balanced tx ready for submission');

        // Step 4: Submit (send to network node)
        const txId = await providers.midnightProvider.submitTx(balancedTx);
        logger.info(`Submitted tx id: ${txId}`);

        // contract deployed and txn finalized
        const finalizedTxData = await providers.publicDataProvider.watchForTxData(txId);
        logger.info(`Finalized! Status: ${finalizedTxData.status}, block: ${finalizedTxData.blockHeight}`);
    
        // Store private state (normally done inside deployContract)
        // @TODO -- why is it occuring here?
        providers.privateStateProvider.setContractAddress(pendingAddress);
        await providers.privateStateProvider.set(PRIVATE_STATE_ID, initialPrivateState);

        contractAddress = pendingAddress;
        logger.info(`Contract address: ${contractAddress}`);
        expect(contractAddress).toBeDefined();
        expect(contractAddress.length).toBeGreaterThan(0);

        // bob stuff
        bobProviders.privateStateProvider.setContractAddress(pendingAddress)
        await bobProviders.privateStateProvider.set(BOB_PRIVATE_STATE_ID, bobPrivateState);

        // verify initial ledger state (constructor execution)
        const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
        expect(contractState).not.toBeNull();
        const state = ledger(contractState!.data);
        expect(state.maxListSize).toEqual(99n);
        expect(state.partyState).toEqual(PartyState.NOT_READY);
        logger.info(`Initial State: maxListSize: ${state.maxListSize}, partyState: ${state.partyState}`);

        // How do we get the CoinPublicKey of the caller?
        logger.info(`Verifying the CoinPublicKey of the caller has been stored on chain...`);
        const callerCoinPublicKey: CoinPublicKey = providers.walletProvider.getCoinPublicKey();
        const encoded = encodeCoinPublicKey(callerCoinPublicKey);
        expect(state.organizers.member({bytes: encoded})).toBeTruthy();
        logger.info(`CoinPublicKey of the organizer: ${callerCoinPublicKey}`);

        // need to have type signatures correct in the args because the errors are bad
        logger.info(`Adding an organizer...`);
        const newOrganizerEncoded = encodeCoinPublicKey(bobWallet.getCoinPublicKey());
        const txData1: any = await (submitCallTx as any)(providers, {
            compiledContract: CompiledPartyContract,
            contractAddress,
            privateStateId: PRIVATE_STATE_ID,
            circuitId: 'addOrganizer',
            args: [{bytes: newOrganizerEncoded}]
        });

        const nextContractState = await providers.publicDataProvider.queryContractState(contractAddress);
        expect(nextContractState).not.toBeNull();
        const nextState = ledger(nextContractState!.data);
        expect(nextState.organizers.member({bytes: newOrganizerEncoded})).toBeTruthy();
        expect(nextState.organizers.size()).toEqual(2n);
        logger.info(`New organizer added!`);

        // addParticipant test
        const partier1 = randomBytes(32);
        const organizerSk = randomBytes(32);
        logger.info(`Adding a participant`);
        const txData2: any = await (submitCallTx as any)(providers, {
            compiledContract: CompiledPartyContract,
            contractAddress,
            privateStateId: PRIVATE_STATE_ID,// does this matter?
            circuitId: 'addParticipant',
            args: [partier1, organizerSk],
        });

        const nextNextContractState = await providers.publicDataProvider.queryContractState(contractAddress);
        expect(nextNextContractState).not.toBeNull();
        const nextNextState = ledger(nextNextContractState!.data);
        expect(nextNextState.hashedPartyGoers.size()).toEqual(1n);
        expect(nextNextState.partyState).toEqual(PartyState.NOT_READY);
        logger.info(`New participant added, but their ID is private!`);

        const partier2 = randomBytes(32);
        logger.info(`Adding a second party goer...`);
        const txData3: any = await (submitCallTx as any)(providers, {
            compiledContract: CompiledPartyContract,
            contractAddress,
            privateStateId: PRIVATE_STATE_ID,
            circuitId: 'addParticipant',
            args: [partier2, organizerSk],
        });
        const thirdContractState = await providers.publicDataProvider.queryContractState(contractAddress);
        expect(thirdContractState).not.toBeNull();
        const thirdState = ledger(thirdContractState!.data);
        expect(thirdState.hashedPartyGoers.size()).toEqual(2n);
        expect(thirdState.partyState).toEqual(PartyState.NOT_READY);
        logger.info(`Second party goer has been added, but their ID is private!`);

        // start the party
        logger.info(`Starting the party...`);
        const txData4: any = await (submitCallTx as any)(providers, {
            compiledContract: CompiledPartyContract,
            contractAddress,
            privateStateId: PRIVATE_STATE_ID,
            circuitId: 'chainStartParty',
            args: [],
        });
        const fourthContractState = await providers.publicDataProvider.queryContractState(contractAddress);
        expect(fourthContractState).not.toBeNull();
        const fourthState = ledger(fourthContractState!.data);
        expect(fourthState.partyState).toEqual(PartyState.READY);
        logger.info(`Party started! On chain party state: ${fourthState.partyState}`);

        logger.info(`Checking in a participant...`);
        const txData5: any = await (submitCallTx as any)(providers, {
            compiledContract: CompiledPartyContract,
            contractAddress,
            privateStateId: PRIVATE_STATE_ID,
            circuitId: 'checkIn',
            args: [partier1, organizerSk]// participantPk, organizerSk
        });

        const firstFinalContractState = await providers.publicDataProvider.queryContractState(contractAddress);
        expect(firstFinalContractState).not.toBeNull();
        const firstFinal = ledger(firstFinalContractState!.data);
        expect(firstFinal.checkedInParty.member(partier1)).toBeTruthy();
        logger.info(`Participant checked in! ID can now be revealed, partier1: ${partier1}`);

        // Now test calling from a different perspective
        // How?
        // 1. Providers -- pass in a new provider object that is set to the new user,
        // with new PRIVATE_STATE_ID, same contract address and compiled contract
        // it seems like a wrapper could be implemented here?
        logger.info(`Attempting to check in a user as Bob...`);
        // maybe fails? Definitely doesn't complete
        expect(async () => {
            const txData6: any = await (submitCallTx as any)(bobProviders, {
            compiledContract: CompiledPartyContract,
            contractAddress,
            privateStateId: BOB_PRIVATE_STATE_ID,
            circuitId: 'checkIn',
            args: [partier2, organizerSk]// circuit params
            });
        }).toThrow();
        // expect(txData6).toBeUndefined();

    });// end of test case 'deploys contract'
    it('adds an organizer', async () => {
    });
})