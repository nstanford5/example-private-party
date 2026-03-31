import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import { PartyState, type Ledger } from './managed/private-party/contract/index.js';

export type PartyPrivateState = {
    address: string,
    sk: Uint8Array,
}

export const createPartyPrivateState = (address: string, sk: Uint8Array) => ({
    address,
    sk
});

export const witnesses = {
    localStartParty: ({
        privateState
    }: WitnessContext<Ledger, PartyPrivateState>): [
        PartyPrivateState,
        number
    ] => {
        return [privateState, PartyState.READY];
    },
    localSk: ({
        privateState
    }: WitnessContext<Ledger, PartyPrivateState>): [
        PartyPrivateState,
        Uint8Array,
    ] => {
        return [privateState, privateState.sk]
    }
};
