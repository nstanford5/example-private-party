# Private Party Tutorial

The private-party contract is a beginner level contract that will demonstrate the following features:
- Hiding information on the public ledger
- Verifying hidden ledger information later
- Access control to circuits
- Operations on a set
- Introduction to Witness functions

This tutorial covers a line-by-line walkthrough of the Compact code and the supporting frontend test suite. It does not cover any UI implementation.

## Prerequisites

Before you begin this tutorial, esure you have:
- [installed the toolchain](../../getting-started/installation)
- Node.js v22+

## Problem Analysis

Let's say you have a party and want to keep the guest list private. Maybe you want to keep the guests from knowing who each other are or maybe you want to hide the guest list from the public until the party starts. Midnight allows you to hide this information in plain sight and later verify that information.

The party organizer can hide each participant on the public ledger through hashing capabilities provided by Compact and use those same capabilities to later prove the information under that hash.

Each user could be added to the list by the organizer and the list kept private until the attendees arrive to check-in to the party. After attendees check in, their information can be made public, likely the paparazzi saw them coming in anyway..

## Program Design

The organizer needs to be able to:
1. start the contract
1. add other organizers
1. add party participants
1. start the party (locally and on-chain)
1. Allow members of the guest list to check in (verification)
1. Reveal members of the guest list to the public

These program actions will map to (in no particular order):
- Compact circuits
- TypeScript Witness functions
- Public Ledger operations
- Private state variables
- Hashing functions and later verification of the data

## Compact Tutorial

Compact provides many useful capabilities to support our private party. This section focuses on the design and implementation of the Compact code that will be deployed as the backend.

### Setup

Create the project root folder and `package.json`:
```bash
mkdir example-private-party && cd example-private-party
touch package.json 
```

Add the following to `package.json`:
```json
{
  "name": "example-private-party",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "contracts"
  ],
  "scripts": {
    "test": "vitest"
  },
  "devDependencies": {
    "@types/node": "^25.3.2",
    "testcontainers": "^11.12.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  },
  "dependencies": {
    "@midnight-ntwrk/compact-runtime": "0.14.0",
    "@midnight-ntwrk/midnight-js-network-id": "3.1.0",
    "@midnight-ntwrk/compact-js": "2.4.0"
  }
}
```

Install the depedencies:
```bash
npm install
```

Set up for Compact code:
```bash
mkdir contracts && cd contracts
mkdir src && cd src
touch private-guest-list.compact
```

Open the `.compact` file in your text editor and start with some declarations:
```compact
pragma language_version 0.21;
import CompactStandardLibrary;

export enum PartyState {
    NOT_READY,
    READY
}
```
- `pragma language_version` specifies the compatible version of the Compact language.
- We then `import` the `CompactStandardLibrary` which provides standard types and circuits for use in Compact programs.
- `enum PartyState` declares a custom data type through and assign it two available values `NOT_READY, READY`.

### Identifier declarations

Now we'll declare the public ledger identifiers and their types:
```compact
export ledger organizers: Set<ZswapCoinPublicKey>;
export ledger hashedPartyGoers: Set<Bytes<32>>;
export ledger checkedInParty: Set<Bytes<32>>;
export ledger partyState: PartyState;
export ledger maxListSize: Uint<8>;
```

All values with the `ledger` declaration are *public* values. Compact comes with the ability to hide information in these values through hashing and commitment schemes. In particular, we will be hiding the list of party participants in `hashedPartyGoers`.

Organizers will be public information through their public key in the Set of `organizers`, which is represented through the `ZswapCoinPublicKey` type. The Set type is useful here because it only allows each value to be present once.

### Witness function signature

The Compact code will only be aware of the function signature of our witness code. In this way, Compact does not actually need to know the underlying code in the frontend witness function -- we can still enforce correct execution there through our use of `assert()` statements in the backend.

Add the witness function signature:
```compact
witness localStartParty(): PartyState;
```

We expect the party to start (IRL or "locally") when the guest list is full or the organizer hits the start party button. After the party starts, the function should return the current state of the party from our custom `enum PartyState`.

### Party Constructor

Let's construct this party by defining its initial state through the constructor:
```compact
constructor() {
    organizers.insert(ownPublicKey());
    partyState = PartyState.NOT_READY;
    maxListSize = 99;
}
```
- First we `insert` on the `organizers` Set to add the public key of the caller.
- Then the public `partyState` variable is to `NOT_READY`.
- The max guest list size is set to `99`, arbitrarily.

### Add Organizer Circuit

The existing organizer may wish to add other organizers to the Set:
```compact
export circuit addOrganizer(newOrganizer: ZswapCoinPublicKey): [] {
    assert(organizers.member(ownPublicKey()), "You are not an organizer");
    assert(!organizers.member(disclose(newOrganizer)), "You are already in the organizer list");
    assert(partyState == PartyState.NOT_READY, "The party has already started");
    
    organizers.insert(disclose(newOrganizer));
}
```
- The block starts with the signature of the circuit `addOrganizer`  
    - `export` makes this circuit available outside of the contract.
    - `(newOrganizer: ZswapCoinPublicKey)` takes the public key of the organizer to be added to the Set as an input parameter.
    - `[]` denotes that this circuit has no return value.
- `ownPublicKey()` returns the public key of the caller and stores it.
- `assert`s are access control checks. These checks verify:
    - Only an organizer can call this function.
    - The organizer to be added is not already in the Set.
    - The party has not started yet.
    - Only after these have been verified to be correct, will the new organizer be added to the public `organizers` set.

:::note
Information passed through parameters to and inside of Compact circuits is *private by default* and not including explicit `disclose()` when a value may be exposed publicly, will result in a compiler error. 
:::

### Add Participant(s)

Now that we have our list of organizers, we need them to be able to add participants to the ledger. But we know that all ledger information is public, so how do we hide the participants public keys on the ledger without revealing them?

The answer is through Compact's `persistentHash`, a SHA-256–based, upgrade-stable hash function that compresses (mostly arbitrary) Compact values into a 32-byte result suitable for deriving persistent on-chain state. Let's implement it:
```compact
circuit commitWithSk(_participantPk: Bytes<32>, _sk: Bytes<32>) : Bytes<32> {
    return disclose(persistentHash<Vector<2, Bytes<32>>>([_participantPk, _sk]));
}
```
- The `circuit` signature:
    - note there is no `export`, so this function is only available to this contract internally.
    - The circuit takes in the public key to be hashed and the secret key of the organizer hashing the information. Remember that circuit inputs are private, so it is safe to pass this information here.
- The circuit then returns the hash after `disclose()`ing it. Attempting to post this hash to the ledger before `disclose()` will result in a compiler error. This is one way that Compact demonstrates privacy by default.

That's everything we need for our internal hashing function. Now, let's look at the full `addParticipant` circuit:
```compact
export circuit addParticipant(_participantPk: Bytes<32>, _organizerSk: Bytes<32>): [] {
    // only organizers can add party goers
    assert(organizers.member(ownPublicKey()), "You are not an organizer");
    assert(partyState == PartyState.NOT_READY, "The party has already started");
    assert(hashedPartyGoers.size() < maxListSize, "The list is full");

    const participant = commitWithSk(_participantPk, _organizerSk);
    assert(!hashedPartyGoers.member(disclose(participant)), "You are already in the list");
    hashedPartyGoers.insert(disclose(participant));

    if (hashedPartyGoers.size() == maxListSize) {
        const localPartyState = localStartParty();
        // don't trust, verify
        assert(localPartyState == PartyState.READY, "Please start the party, the list is full");
        partyState = PartyState.READY;
    }
}
```
- The circuit starts with access control `assert`ions. The location of these assertions is as important as the checks themselves.
- Then it calls the `commitWithSk()` circuit and returns the hash of the participant.
- Now we `insert` that hash into the Set of `hashedPartyGoers`, but only after checking that they are not alredy in the list. It is best practice to keep the `commitWithSk` and `disclose()` lines seperate, so as not to potentially leak the private inputs.
- After adding another private "name" to the list it checks if the list is full.
- If the list is full, we call the witness function `localStartParty()` in the frontend. we can never trust the execution of logic in a `witness` function, so we don't trust, we verify.
- `assert` the correct return from the frontend function. In this way, we can guarantee the frontend function returns what we expect it to, without ever knowing the logic in `localStartParty()`
- Finally it updates the ledger variable `partyState`.

### Start the party (on-chain)

We've already defined in `addParticipant` the start of the party if the list is full, but what about starting the party with a less than full list? Let's craft an on-chain function that can be called by the organizer to transition the public state of the party:
```compact
export circuit chainStartParty(): [] {
    assert(organizers.member(ownPublicKey()), "Only organizers can start the party");
    assert(partyState == PartyState.NOT_READY, "The party has already started");

    const localPartyState = disclose(localStartParty());
    assert(localPartyState == PartyState.READY, "Please start the party locally");
    partyState = localPartyState;
}
```
- The circuit starts with access control checks.
- Then it `disclose`s the return of the frontend `localStartParty()` function. The return is private by default, so omitting the `disclose` would result in a compiler error.
- We then add an `assert` that verifies the return value is correct. Don't trust, verify.
- Finally, update the public `partyState` ledger variable. All ledger values are public.

### Check-in to the party

Now that the participants have been added and the party has started, the next step is to let participants check in at the party:
```compact
export circuit checkIn(participantPk: Bytes<32>, _organizerSk: Bytes<32>): [] {
    assert(organizers.member(ownPublicKey()), "You are not an organizer");
    assert(partyState == PartyState.READY, "The party has not started yet");
    assert(checkedInParty.size() < hashedPartyGoers.size(), "All guests have already checked in");
    assert(hashedPartyGoers.member(commitWithSk(participantPk, _organizerSk)), "You are not on the list");

    checkedInParty.insert(disclose(participantPk));
}
```
- Access control checks include verifying:
    - The caller is an organizer.
    - Party state is as expected.
    - Not all guests have checked in.
- The final assertion here is the interesting line in that it is how we check previously hashed information. We cannot "unhash" the existing hash, the value under it is hidden forever. What we can do is have the user provide the value again, hash the value again and compare the hashes. When hashing the exact same information, we expect the exact same hash, because `persistentHash` is a deterministic function.
- After verifying this public key is in the list, it provides the `disclose` to let the compiler know that the information is now marked as public and stored in `checkedInParty`. The party has started, so we store the public key directly.

That's all folks, all of the Compact code we need to start our private party contract in about 70 lines. Let's make sure the program compiles, from the `src` directory:
```bash
compact compile private-guest-list.compact managed/private-guest-list
```

Should produce output like this:
```terminal
Compiling 4 circuits:
  circuit "addOrganizer" (k=10, rows=572)  
  circuit "addParticipant" (k=13, rows=4791)  
  circuit "chainStartParty" (k=9, rows=293)  
  circuit "checkIn" (k=13, rows=4765)  
Overall progress [====================] 4/4
```
:::note
If compilation was not successful, work with the compiler output to determine where the error may exist in your code. A lot of lessons can be learned by fighting with the compiler.
:::

After successful compilation, you should see new directories for the compiled contract artifacts:
```
contracts/
├── src/
|   └── managed/
|       └── private-party/
|           ├── compiler/
|           ├── contract/
|           ├── keys/
|           └── zkir/
└── private-party.compact
```

Now that the contract compiles correctly, let's move on to the definitions of the witness functions.

## TS config

Before writing any Typescript, make sure to create the config file in the `contracts` directory:
```bash
cd ..
touch tsconfig.json
```

Populate the config file:
```json
{
  "include": ["src/**/*.ts"],
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "lib": ["ESNext"],
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "allowJs": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": true,
    "strict": true,
    "isolatedModules": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

## Witnesses in the frontend

In our Compact contract, we declared a witness function. As a reminder, the witness function only has a signature declaration in Compact, it is actually defined in the frontend of the DApp, which is why we *don't trust any witness* but we must *verify* information from witness functions. Enough philosophy, let's create our frontend witness file:
```bash
cd src
touch src/witnesses.ts
```

Start by creating necessary imports:
```ts
import { Ledger, PartyState } from './managed/private-guest-list/contract/index.js';
import { WitnessContext } from '@midnight-ntwrk/compact-runtime';
```

We should also define a type for all of the data required to be in the private state of the DApp:
```ts
export type PartyPrivateState = {
    address: string,
    sk: Uint8Array
}
```

The private state of any particular user in our application is simple, it only contains the `address` and the secret key `sk` of a particular party goer.

Next, let's create a helper function for returning on object of the `PartyPrivateState` type:
```ts
export const createPartyPrivateState = (address: string, sk: Uint8Array) => ({
    address,
    sk
});
```

Now let's move on to our witness function. The input parameters and returns *must exactly match* the function signature declaration in our `.compact` file. As a reminder, that signature is `localStartParty() : PartyState`. Let's see what that looks like in the frontend:
```ts
export const witnesses = {
    localStartParty: ({
        privateState
    }: WitnessContext<Ledger, PartyPrivateState>): [
        PartyPrivateState,
        number
    ] => [privateState, PartyState.READY],
};
```
- `const witnesses` is an object to hold all of the witness functions from the contract.
- `localStartParty` begins the signature of the function.
- `privateState` is always passed as a parameter and this *must be included* here for all witness functions.
- The first parameter our witness function *must always include* the `WitnessContext<L, PS>`. This can be followed by any other parameters defined by `localStartParty()` in the contract. This one takes no other input parameters.
- `PartyPrivateState` and `number` are the return types. The witness function must always return the private state as its first return value.
- The final line returns the actual values for the corresponding return types.

## Party Simulator

In order to run many tests against our private-party contract, we'll need to create a class that will be used to initiate different test cases:
```bash
cd contracts/src
mkdir test && cd test
touch party-simulator.ts
```

Open the `party-simulator.ts` file in your VSCode

### Imports

For now let's just add the necessary imports:
```ts
import {
    type CircuitContext,
    sampleContractAddress,
    createConstructorContext,
    CostModel,
    QueryContext,
    sampleUserAddress,
    createCircuitContext,
    ChargedState,
    encodeCoinPublicKey
} from "@midnight-ntwrk/compact-runtime";
import { 
    Contract,
    type Ledger,
    ledger,
 } from "../managed/private-guest-list/contract/index.js";
import { 
    type PartyPrivateState, 
    witnesses, 
    createPartyPrivateState 
} from "../witnesses.js";
import { randomBytes } from './utils.js';
```

Now let's write the simulator class.

## Test using the Simulator

Create the scaffolding for necessary class components:
```ts
export class PartySimulator {

    constructor() {

    }
}
```

Let's define the type for our new contract, create a new instance and make an address:
```ts
export class PartySimulator {
    readonly contract: Contract<PartyPrivateState>;
    contractAddress: string;

    constructor() {
        this.contract = new Contract<PartyPrivateState>(witnesses);
        this.contractAddress = sampleContractAddress();
    }
}
```

Now we create the initial state of our contract and some values for Alice:
```ts
export class PartySimulator {
    readonly contract: Contract<PartyPrivateState>;
    contractAddress: string;
    alicePrivateState: PartyPrivateState;
    aliceAddress: string;
    aliceSk: Uint8Array;

    constructor() {
        this.contract = new Contract<PartyPrivateState>(witnesses);
        this.contractAddress = sampleContractAddress();
        this.aliceAddress = sampleUserAddress();
        this.aliceSk = randomBytes(32);
        this.alicePrivateState = createPartyPrivateState(this.aliceAddress, this.aliceSk);
        const {
            currentPrivateState,
            currentContractState,
            currentZswapLocalState
        } = this.contract.initialState(
            createConstructorContext(this.alicePrivateState, this.aliceAddress)
        );
    }
}
```

Now we need to provide context for executing circuits:
```ts
export class PartySimulator {
    readonly contract: Contract<PartyPrivateState>;
    contractAddress: string;
    alicePrivateState: PartyPrivateState;
    aliceAddress: string;
    circuitContext: CircuitContext<PartyPrivateState>;// new


    constructor() {
        this.contract = new Contract<PartyPrivateState>(witnesses);
        this.contractAddress = sampleContractAddress();
        this.aliceSk = randomBytes(32);
        this.aliceAddress = sampleUserAddress();
        this.alicePrivateState = createPartyPrivateState(this.aliceAddress, this.aliceSk);
        const {
            currentPrivateState,
            currentContractState,
            currentZswapLocalState
        } = this.contract.initialState(
            createConstructorContext(this.alicePrivateState, this.aliceAddress)
        );
        this.circuitContext = {// new
            currentPrivateState,
            currentZswapLocalState,
            costModel: CostModel.initialCostModel(),
            currentQueryContext: new QueryContext(
                currentContractState.data,
                this.contractAddress,
            )
        };
    }// end of constructor
```

Now we need to create functions in our simulator for calling in to the circuits in our contract, add this just below the constructor:
```ts
    // addOrganizer
    public addOrganizer(newOrganizer: Uint8Array): void {
        this.circuitContext = this.contract.impureCircuits.addOrganizer(
            this.circuitContext,// always pass as first argument
            { bytes: newOrganizer }
        ).context;
    }
    // addParticipant
    // checkIn
    // chainStartParty
```
Here we demonstrate the shape of circuit calls, what would the other definitions look like? Be sure to try them yourself before looking up the solution below -- the rest have very similar types and data shapes, with only some minor differences.


Now the solutions:
```ts
    }// end of constructor
    // addOrganizer
    public addOrganizer(newOrganizer: Uint8Array): void {
        this.circuitContext = this.contract.impureCircuits.addOrganizer(
            this.circuitContext,
            { bytes: newOrganizer },// encoded from Uint8Array to Bytes
        ).context;
    }
    // addParticipant
    public addParticipant(participantPk: Uint8Array, organizerSk: Uint8Array): void {
        this.circuitContext = this.contract.impureCircuits.addParticipant(
            this.circuitContext,
            participantPk,
            organizerSk,
        ).context;
    }
    // checkIn
    public checkIn(participantPk: Uint8Array, organizerSk: Uint8Array): void {
        this.circuitContext = this.contract.impureCircuits.checkIn(
            this.circuitContext,
            participantPk,
            organizerSk,
        ).context;
    }
    // chainStartParty
    public chainStartParty(): void {
        this.circuitContext = this.contract.impureCircuits.chainStartParty(
            this.circuitContext,
        ).context;
    }
}// end of class
```

It will also be useful to define some helper functions for use in our tests, add these after your `chainStartParty` function:
```ts
    // test helper functions
    public getLedger(): Ledger {
        return ledger(this.circuitContext.currentQueryContext.state);
    }

    public getContractState(): ChargedState {
        return this.circuitContext.currentQueryContext.state;
    }

    public switchCallers(callerContext: CircuitContext): void {
        this.circuitContext = callerContext;
    }

    public aliceSwitch(contractState: ChargedState): void {
        this.circuitContext = createCircuitContext(
            this.contractAddress,
            this.aliceAddress,
            contractState,
            this.alicePrivateState
        );
    }
}// end of class
```

Now let's define another class for our party goers:
```ts
export class WalletBuilder {
    address: string;
    encodedAddress: Uint8Array;
    sk: Uint8Array;
    privateState: PartyPrivateState;
    callerContext: CircuitContext<PartyPrivateState>;
    contractAddress: string;

    constructor(contractAddress: string, contractState: ChargedState) {
        this.address = sampleUserAddress();
        this.encodedAddress = encodeCoinPublicKey(this.address);
        this.sk = randomBytes(32);
        this.contractAddress = contractAddress;
        this.privateState = createPartyPrivateState(
            this.address,
            this.sk
        );
        this.callerContext = createCircuitContext(
            contractAddress,
            this.address,
            contractState,
            this.privateState
        );
    }
    // use this if the contract state has changed since the creation of the wallet
    public updateCallerContext(contractState: ChargedState): void {
        this.callerContext = createCircuitContext(
            this.contractAddress,
            this.address,
            contractState,
            this.privateState
        );
    }
}
```

And that is all for Simulator code -- we can now create instances of our party contract quickly and efficiently! Let's finish the setup before moving on to writing tests.

Create `test/utils.ts` and add the helper function for `randomBytes`:
```
export const randomBytes = (length: number): Uint8Array => {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}
```

### Setup for Tests

Create the `vitest.config.ts` file:
```bash
touch contracts/vitest.config.ts
```

Populate the testing config file:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  mode: "node",
  test: {
    deps: {
      interopDefault: true
    },
    globals: true,
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules"],
    root: ".",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        branches: 50,
        functions: 73,
        lines: 72,
        statements: -269
      }
    },
    reporters: ["default", ["junit", { outputFile: "reports/report.xml" }]]
  },
  resolve: {
    extensions: [".ts", ".js"],
    conditions: ["import", "node", "default"]
  }
});
```

Save the file and we'll move on to writing some tests.

### Test writing party

...or is it a party writing tests? Either way, this is where we'll create many instances of the `private-guest-list` contract and test every interaction possible. 

First, let's create our test file:
```bash
touch test/party.test.ts
```

Declare imports:
```ts
import { PartySimulator, WalletBuilder } from './party-simulator.js';
import { NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';
import { PartyState } from '../managed/private-guest-list/contract/index.js';
import { randomBytes } from './utils.js';
import { sampleUserAddress, encodeCoinPublicKey} from '@midnight-ntwrk/compact-runtime';
```

Set the network Id to "undeployed":
```ts
setNetworkId('undeployed' as NetworkId);
```

Scaffold the test and write your first test case:
```ts
describe("Private Party smart contract", () => {
    it("executes the constructor correctly", () => {
        const sim = new PartySimulator();// create new simulator instance
        const ledgerState = sim.getLedger();// return current ledger state
        
        // tests
        expect(ledgerState.organizers.size()).toEqual(1n);
        expect(ledgerState.partyState).toEqual(PartyState.NOT_READY);
        expect(ledgerState.maxListSize).toEqual(99n);
    });
});
```

This tests that the constructor runs properly and that ledger values are set correctly after the constructor executes. Execute the test suite by navigating to the `test` directory and running:
```bash
npm run test
```

What other tests should be run? Spend some time looking over the smart contract and writing some tests. Maybe the next one should be:
```ts
// next test
it ("adds an organizer", () => {});
```

Make sure to write as many tests as you can think of!

After writing tests of your own, you can view the full repository for this tutorial here: [replace this link to `example-private-guest-list` repo](https://github.com/nstanford5/example-private-party)
