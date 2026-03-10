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

// witness function definition(s)
export const witnesses = {
    localStartParty: ({
        privateState// always pass in the current private state
        // WitnessContext is always the first argument, followed by localStartParty params
    }: WitnessContext<Ledger, PartyPrivateState>): [
        // return types
        PartyPrivateState,// always return the state
        number
    ] => [privateState, PartyState.READY],
};