import { PartySimulator, WalletBuilder } from './party-simulator.js';
import { NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';
import { PartyState } from '../managed/private-party/contract/index.js';
import { randomBytes } from './utils.js';
import { sampleUserAddress, encodeCoinPublicKey} from '@midnight-ntwrk/compact-runtime';

setNetworkId('undeployed' as NetworkId);

describe("Private Party smart contract", () => {
    it("executes the constructor correctly", () => {
        const sim = new PartySimulator();// create new simulator instance
        
        // invoke helper function to return current ledger state
        const ledgerState = sim.getLedger();
        
        // tests
        expect(ledgerState.organizers.size()).toEqual(1n);
        expect(ledgerState.partyState).toEqual(PartyState.NOT_READY);
        expect(ledgerState.maxListSize).toEqual(99n);
    });
    it("adds an organizer", () => {
        const sim = new PartySimulator();
        const initialLedgerState = sim.getLedger();

        const bob = new WalletBuilder(sim.contractAddress, sim.getContractState());
        sim.addOrganizer(bob.encodedAddress);
        const newLedgerState = sim.getLedger();

        expect(initialLedgerState.organizers.size()).toEqual(1n);
        expect(newLedgerState.organizers.size()).toEqual(2n);
    });
    it("adds a participant", () => {
        const sim = new PartySimulator();
        const bob = new WalletBuilder(sim.contractAddress, sim.getContractState());
        sim.addParticipant(bob.encodedAddress, sim.aliceSk);

        const ledgerState = sim.getLedger();
        expect(ledgerState.hashedPartyGoers.size()).toEqual(1n);
    });
    it("starts the party with a less than full list", () => {
        const sim = new PartySimulator();
        for(let i = 0; i < 25; i++){
            const address = sampleUserAddress();
            const encoded = encodeCoinPublicKey(address);
            sim.addParticipant(encoded, sim.aliceSk);
        }
        const ledgerState = sim.getLedger();
        expect(ledgerState.hashedPartyGoers.size()).toEqual(25n);
        expect(ledgerState.partyState).toEqual(PartyState.NOT_READY);
        
        sim.chainStartParty();
        const newLedgerState = sim.getLedger();

        expect(newLedgerState.partyState).toEqual(PartyState.READY);
    });
    it("starts the party with a full list", () => {
        const sim = new PartySimulator();
        for(let i = 0; i < 99; i++){
            const address = sampleUserAddress();
            const encoded = encodeCoinPublicKey(address);
            sim.addParticipant(encoded, sim.aliceSk);
        }
        const ledgerState = sim.getLedger();

        expect(ledgerState.hashedPartyGoers.size()).toEqual(99n);
        expect(ledgerState.partyState).toEqual(PartyState.READY);
    });
    it("allows participants to check in", () => {
        const sim = new PartySimulator();
        const participant = randomBytes(32);
        sim.addParticipant(participant, sim.aliceSk);
        for(let i = 1; i < 25; i++){
            const address = sampleUserAddress();
            const encoded = encodeCoinPublicKey(address);
            sim.addParticipant(encoded, sim.aliceSk);
        }
        sim.chainStartParty();
        const ledgerState = sim.getLedger();
        expect(ledgerState.partyState).toEqual(PartyState.READY);

        sim.checkIn(participant, sim.aliceSk);
        const newLedgerState = sim.getLedger();
        expect(newLedgerState.checkedInParty.member(participant)).toBeTruthy();
        expect(newLedgerState.checkedInParty.size()).toEqual(1n);
    });
    it("blocks Bob from adding an organizer", () => {
        const sim = new PartySimulator();

        const bob = new WalletBuilder(sim.contractAddress, sim.getContractState());
        sim.switchCallers(bob.callerContext);

        expect(() => {
            const address = sampleUserAddress();
            const encoded = encodeCoinPublicKey(address);
            sim.addOrganizer(encoded);
        }).toThrow("You are not an organizer");
    });
    it("blocks Bob from adding a participant", () => {
        const sim = new PartySimulator();
        const address = sampleUserAddress();
        const encoded = encodeCoinPublicKey(address);
        sim.addParticipant(encoded, sim.aliceSk);

        const bob = new WalletBuilder(sim.contractAddress, sim.getContractState());
        sim.switchCallers(bob.callerContext);
        const claire = new WalletBuilder(sim.contractAddress, sim.getContractState());
        const claireEncoded = encodeCoinPublicKey(claire.address);
        expect(() => {
            sim.addParticipant(claireEncoded, bob.sk);
        }).toThrow("You are not an organizer");
    });
    it("blocks Bob from checking in participants", () => {
        const sim = new PartySimulator();
        const persistAddress = sampleUserAddress();
        const encodedPersist = encodeCoinPublicKey(persistAddress);
        sim.addParticipant(encodedPersist, sim.aliceSk);

        for(let i = 0; i < 23; i++){
            const address = sampleUserAddress();
            const encoded = encodeCoinPublicKey(address);
            sim.addParticipant(encoded, sim.aliceSk);
        };

        sim.chainStartParty();
        const ledgerState = sim.getLedger();
        expect(ledgerState.partyState).toEqual(PartyState.READY);

        const bob = new WalletBuilder(sim.contractAddress, sim.getContractState());
        sim.switchCallers(bob.callerContext);
        expect(() => {
            sim.checkIn(encodedPersist, bob.sk);
        }).toThrow("You are not an organizer");
    });
    it("blocks Bob from starting the party", () => {
        const sim = new PartySimulator();
        for(let i = 0; i < 22; i++){
            const address = sampleUserAddress();
            const encoded = encodeCoinPublicKey(address);
            sim.addParticipant(encoded, sim.aliceSk);
        }
        
        // switch to bob
        const bob = new WalletBuilder(sim.contractAddress, sim.getContractState());
        sim.switchCallers(bob.callerContext);
        expect(() => {
            sim.chainStartParty();
        }).toThrow("Only organizers can start the party");

        // the aliceSwitch just reverts to the state prior to hitting the bobSwitch
        // or, said differently, the most recent valid Alice state
        sim.aliceSwitch(sim.getContractState());
        sim.chainStartParty();
        const ledgerState = sim.getLedger();
        expect(ledgerState.partyState).toEqual(PartyState.READY);
        // aliceSwitch persists ledger state
        expect(ledgerState.hashedPartyGoers.size()).toEqual(22n);
    });
    it('tests the generic caller switch', () => {
        // the goal in this test is to achieve persistent contract state
        // across different users to be passed in to circuitContext
        const sim = new PartySimulator();
        for(let i = 0; i < 22; i++){
            const address = sampleUserAddress();
            const encoded = encodeCoinPublicKey(address);
            sim.addParticipant(encoded, sim.aliceSk);
        }
        const ledgerState = sim.getLedger();
        expect(ledgerState.hashedPartyGoers.size()).toEqual(22n);
        const claire = new WalletBuilder(sim.contractAddress, sim.getContractState());
        sim.switchCallers(claire.callerContext);
        expect(() => {
            const address = sampleUserAddress();
            const encoded = encodeCoinPublicKey(address);
            sim.addParticipant(encoded, sim.aliceSk);
        }).toThrow('You are not an organizer');

        // switch back to Alice
        sim.aliceSwitch(sim.getContractState());
        const dale = new WalletBuilder(sim.contractAddress, sim.getContractState());
        sim.addParticipant(dale.encodedAddress, sim.aliceSk);
        const nextLedgerState = sim.getLedger();
        // expect the circuitContext to have a persistent contractState (total number of participants)
        expect(nextLedgerState.hashedPartyGoers.size()).toEqual(23n);

        const edith = new WalletBuilder(sim.contractAddress, sim.getContractState());
        sim.switchCallers(edith.callerContext);
        expect(() => {
            const address = sampleUserAddress();
            const encoded = encodeCoinPublicKey(address);
            sim.addParticipant(encoded, sim.aliceSk);
        }).toThrow('You are not an organizer');

        // switch back to Alice
        sim.aliceSwitch(sim.getContractState());
        sim.chainStartParty();
    });
});