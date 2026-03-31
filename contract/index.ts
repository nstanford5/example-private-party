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
import { witnesses } from './witnesses.js';
import { Contract } from './managed/private-party/contract/index.js';

const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export const zkConfigPath = path.resolve(currentDir, 'managed', 'private-party');

export const CompiledPartyContract = CompiledContract.make(
  'PartyContract',
  Contract,
).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);