import {
    type CircuitContext,
    sampleContractAddress,
    createConstructorContext,
    CostModel,
    QueryContext,
    sampleUserAddress,
    createCircuitContext,
    ChargedState
} from "@midnight-ntwrk/compact-runtime";
import { 
    Contract,
    type Ledger,
    ledger,
    PartyState,
 } from "../managed/private-party/contract/index.js";
import { 
    type PartyPrivateState, 
    witnesses, 
    createPartyPrivateState 
} from "../witnesses.js";
import { randomBytes } from './utils.js';

export class PartySimulator {
    readonly contract: Contract<PartyPrivateState>;
    contractAddress: string;
    alicePrivateState: PartyPrivateState;
    bobPrivateState: PartyPrivateState;
    circuitContext: CircuitContext<PartyPrivateState>;
    bobContext: CircuitContext<PartyPrivateState>;
    aliceAddress: string;
    aliceSk: Uint8Array;
    bobAddress: string;
    bobSk: Uint8Array;
    prevContext: CircuitContext<PartyPrivateState>;
    turnContext: CircuitContext<PartyPrivateState>;
    userPrivateStates: Record<string, PartyPrivateState>;
    updateUserPrivateState: (newPrivateState: PartyPrivateState) => void;


    constructor() {
        this.contract = new Contract<PartyPrivateState>(witnesses);
        this.contractAddress = sampleContractAddress();
        this.aliceSk = randomBytes(32);
        this.aliceAddress = sampleUserAddress();
        this.alicePrivateState = createPartyPrivateState(this.aliceAddress, this.aliceSk);
        this.bobAddress = sampleUserAddress();
        this.bobSk = randomBytes(32);
        this.bobPrivateState = createPartyPrivateState(this.bobAddress, this.bobSk);
        this.updateUserPrivateState = (newPrivateState: PartyPrivateState) => {};
        const {
            currentPrivateState,
            currentContractState,
            currentZswapLocalState
        } = this.contract.initialState(
            createConstructorContext(this.alicePrivateState, this.aliceAddress)
        );
        this.userPrivateStates = { ['alice']: currentPrivateState };
        this.turnContext = createCircuitContext(
            this.contractAddress,
            this.aliceAddress,
            currentContractState,
            this.alicePrivateState
        );
        this.circuitContext = {
            currentPrivateState,
            currentZswapLocalState,
            costModel: CostModel.initialCostModel(),
            currentQueryContext: new QueryContext(
                currentContractState.data,
                this.contractAddress,
            ),
        };
        this.prevContext = this.circuitContext;
        // context to switch the caller to bob in bobSwitch()
        this.bobContext = createCircuitContext(
            this.contractAddress,
            this.bobAddress,
            currentContractState.data,
            this.bobPrivateState,
        );
    }// end of constructor

    public buildTurnContext(currentPrivateState: PartyPrivateState): CircuitContext<PartyPrivateState> {
        return {
            ...this.turnContext,
            currentPrivateState,
        };
    }

    public updateUserPrivateStateByName = 
        (name: string) => 
        (newPrivateState: PartyPrivateState): void => {
            this.userPrivateStates[name] = newPrivateState;
        }

    as(name: string): PartySimulator {
        this.circuitContext = this.buildTurnContext(this.userPrivateStates[name]);
        this.updateUserPrivateState = this.updateUserPrivateStateByName(name);
        return this;
    }

    // contract circuit wrappers
    public addOrganizer(newOrganizerPk: Uint8Array): void {
        this.circuitContext = this.contract.impureCircuits.addOrganizer(
            this.circuitContext,
            { bytes: newOrganizerPk },
        ).context;
    }

    public addParticipant(participantPk: Uint8Array, organizerSk: Uint8Array): void {
        this.circuitContext = this.contract.impureCircuits.addParticipant(
            this.circuitContext,
            participantPk,
            organizerSk,
        ).context;
    }

    public checkIn(participantPk: Uint8Array, organizerSk: Uint8Array): void {
        this.circuitContext = this.contract.impureCircuits.checkIn(
            this.circuitContext,
            participantPk,
            organizerSk,
        ).context;
    }

    public chainStartParty(): void {
        this.circuitContext = this.contract.impureCircuits.chainStartParty(
            this.circuitContext,
        ).context;
    }

    // test helper functions
    public getLedger(): Ledger {
        // returns ChargedState wrapped in Ledger!
        return ledger(this.circuitContext.currentQueryContext.state);
    }

    public getContractState(): ChargedState {
        return this.circuitContext.currentQueryContext.state;
    }
    
    public getPrivateState(): PartyPrivateState {
        return this.circuitContext.currentPrivateState;
    }

    public bobSwitch(): void {
        this.prevContext = this.circuitContext;
        this.circuitContext = this.bobContext;
    }
    public bobSwitch2(): void {
        this.circuitContext = createCircuitContext(
            this.contractAddress,
            this.bobAddress,
            this.circuitContext.currentQueryContext.state,
            this.bobPrivateState
        );
        //this.circuitContext = this.bobContext;
    }

    public switchCallers(callerContext: CircuitContext): void {
        this.circuitContext = callerContext;
    }

    public aliceSwitch(): void {
        this.circuitContext = this.prevContext;
    }
}// end of class

export class WalletBuilder {
    address: string;
    sk: Uint8Array;
    privateState: PartyPrivateState;
    callerContext: CircuitContext<PartyPrivateState>;

    constructor(contractAddress: string, contractState: ChargedState) {
        this.address = sampleUserAddress();
        this.sk = randomBytes(32);
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
}