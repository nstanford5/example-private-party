import { CompiledContract } from '@midnight-ntwrk/compact-js';
import path from 'node:path';

export {
    Contract,
    ledger,
    pureCircuits,
    PartyState,
    type Ledger,
    type Witnesses,
    type ImpureCircuits,
    type PureCircuits,
} from './managed/private-party/contract/index.js';

import { PartyState } from './managed/private-party/contract/index.js';

import { Contract, type Witnesses, type Ledger } from './managed/private-party/contract/index.js';
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';

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
    }
};

const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export const zkConfigPath = path.resolve(currentDir, 'managed', 'private-party');

export const CompiledPartyContract = CompiledContract.make(
  'PartyContract',
  Contract,
).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);