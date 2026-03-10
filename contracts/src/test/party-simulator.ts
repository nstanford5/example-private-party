import {
    type CircuitContext,
    sampleContractAddress,
    createConstructorContext,
    CostModel,
    QueryContext,
    sampleUserAddress,
    createCircuitContext
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

export class PartySimulator {
    readonly contract: Contract<PartyPrivateState>;
    contractAddress: string;
    alicePrivateState: PartyPrivateState;
    circuitContext: CircuitContext<PartyPrivateState>;
    bobContext: CircuitContext<PartyPrivateState>;
    aliceAddress: string;
    bobAddress: string;
    bobPrivateState: PartyPrivateState;

    constructor() {
        this.contract = new Contract<PartyPrivateState>(witnesses);
        this.contractAddress = sampleContractAddress();
        this.alicePrivateState = createPartyPrivateState(PartyState.NOT_READY);
        this.aliceAddress = sampleUserAddress();
        this.bobAddress = sampleUserAddress();
        this.bobPrivateState = createPartyPrivateState(PartyState.NOT_READY);
        const {
            currentPrivateState,
            currentContractState,
            currentZswapLocalState
        } = this.contract.initialState(
            createConstructorContext(this.alicePrivateState, this.aliceAddress)
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
        // context to switch the caller to bob in bobSwitch()
        this.bobContext = createCircuitContext(
            this.contractAddress,
            this.bobAddress,
            currentContractState,// this may be wrong?
            this.bobPrivateState,
        );
    }// end of constructor

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
        return ledger(this.circuitContext.currentQueryContext.state);
    }
    
    public getPrivateState(): PartyPrivateState {
        return this.circuitContext.currentPrivateState;
    }
    
    public bobSwitch(): void {
        this.circuitContext = this.bobContext;
    }
}// end of class