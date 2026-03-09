import { Ledger, PartyState } from './managed/private-party/contract/index.js';
import { WitnessContext } from '@midnight-ntwrk/compact-runtime';

// type declaration
export type PartyPrivateState = {
    partyState: number;// enum in Compact -> number in TS
}

// helper function for making an object of the PrivatePartyState type
export const createPartyPrivateState = (partyState: number) => ({
    partyState,
});

// start the tutorial here
export const witnesses = {
    localStartParty: ({
        privateState// always pass in the current state
        // WitnessContext is always the first argument, followed by startParty params
    }: WitnessContext<Ledger, PartyPrivateState>): [
        // return types
        PartyPrivateState,// always return the state
        number
    ] => [privateState, PartyState.READY],
};