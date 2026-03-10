import { PartySimulator } from './party-simulator.js';
import { NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';
import { PartyState } from '../managed/private-party/contract/index.js';
import { randomBytes } from './utils.js';

setNetworkId('undeployed' as NetworkId);

describe("Private Party smart contract", () => {
    it("executes the constructor correctly", () => {
        const sim = new PartySimulator();// create new simulator instance
        const ledgerState = sim.getLedger();// invoke helper function to return current state
        
        // tests
        expect(ledgerState.organizers.size()).toEqual(1n);
        expect(ledgerState.partyState).toEqual(PartyState.NOT_READY);
        expect(ledgerState.maxListSize).toEqual(99n);
    });
    it("adds an organizer", () => {
        const sim = new PartySimulator();
        const initialLedgerState = sim.getLedger();
        sim.addOrganizer(randomBytes(32));
        const newLedgerState = sim.getLedger();

        expect(initialLedgerState.organizers.size()).toEqual(1n);
        expect(newLedgerState.organizers.size()).toEqual(2n);
    });
    it("adds a participant", () => {
        const sim0 = new PartySimulator();
        const participant = randomBytes(32);
        const organizerSk = randomBytes(32);
        sim0.addParticipant(participant, organizerSk);
        const ledgerState = sim0.getLedger();

        expect(ledgerState.partiers).toEqual(1n);
        expect(ledgerState.hashedPartyGoers.size()).toEqual(1n);
    });
    it("starts the party with a less than full list", () => {
        const sim0 = new PartySimulator();
        const organizerSk = randomBytes(32);
        for(let i = 0; i < 25; i++){
            sim0.addParticipant(randomBytes(32), organizerSk);
        }
        const ledgerState = sim0.getLedger();
        expect(ledgerState.hashedPartyGoers.size()).toEqual(25n);

        sim0.chainStartParty();
        const newLedgerState = sim0.getLedger();

        expect(newLedgerState.partyState).toEqual(PartyState.READY);
    });
    it("starts the party with a full list", () => {
        const sim0 = new PartySimulator();
        const organizerSk = randomBytes(32);
        for(let i = 0; i < 99; i++){
            sim0.addParticipant(randomBytes(32), organizerSk);
        }
        const ledgerState = sim0.getLedger();

        expect(ledgerState.hashedPartyGoers.size()).toEqual(99n);
        expect(ledgerState.partyState).toEqual(PartyState.READY);
    });
    it("allows participants to check in", () => {
        const sim0 = new PartySimulator();
        const organizerSk = randomBytes(32);
        const participant = randomBytes(32);
        sim0.addParticipant(participant, organizerSk);
        for(let i = 1; i < 25; i++){
            sim0.addParticipant(randomBytes(32), organizerSk);
        }
        sim0.chainStartParty();
        const ledgerState = sim0.getLedger();
        expect(ledgerState.partyState).toEqual(PartyState.READY);

        sim0.checkIn(participant, organizerSk);
        const newLedgerState = sim0.getLedger();
        expect(newLedgerState.checkedInParty.member(participant)).toBeTruthy();
        expect(newLedgerState.checkedInParty.size()).toEqual(1n);
    });
    it("blocks Bob from adding an organizer", () => {
        const sim = new PartySimulator();

        sim.bobSwitch();// switch the caller to bob

        expect(() => {
            sim.addOrganizer(randomBytes(32));
        }).toThrow("You are not an organizer");
    });
    it("blocks Bob from adding a participant", () => {
        const sim = new PartySimulator();
        const sk = randomBytes(32);
        const pk = randomBytes(32);
        sim.addParticipant(pk, sk);

        sim.bobSwitch();
        const newPk = randomBytes(32);
        const newSk = randomBytes(32);

        expect(() => {
            sim.addParticipant(newPk, newSk);
        }).toThrow("You are not an organizer");
    });
    it("blocks Bob from checking in participants", () => {
        const sim = new PartySimulator();
        const organizerSk = randomBytes(32);
        const persistPk = randomBytes(32);
        sim.addParticipant(persistPk, organizerSk);
        for(let i = 0; i < 23; i++){
            sim.addParticipant(randomBytes(32), organizerSk);
        };
        sim.chainStartParty();
        const ledgerState = sim.getLedger();
        expect(ledgerState.partyState).toEqual(PartyState.READY);

        sim.bobSwitch();// quick, hit the bob switch!
        const bobSk = randomBytes(32);
        expect(() => {
            sim.checkIn(persistPk, bobSk);
        }).toThrow("You are not an organizer");
    });
    it("blocks Bob from starting the party", () => {
        const sim = new PartySimulator();
        const organizerSk = randomBytes(32);
        for(let i = 0; i < 99; i++){
            sim.addParticipant(randomBytes(32), organizerSk);
        }
        
        sim.bobSwitch();
        expect(() => {
            sim.chainStartParty();
        }).toThrow("Only organizers can start the party");
    });
});