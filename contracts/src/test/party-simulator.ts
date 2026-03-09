import {
    type CircuitContext,
    sampleContractAddress,
    createConstructorContext,
    CostModel,
    QueryContext,
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
    startingState: PartyPrivateState;
    circuitContext: CircuitContext<PartyPrivateState>;

    constructor() {
        this.contract = new Contract<PartyPrivateState>(witnesses);
        this.startingState = createPartyPrivateState(PartyState.NOT_READY);
        const {
            currentPrivateState,
            currentContractState,
            currentZswapLocalState
        } = this.contract.initialState(
            // (initialPrivateState, ZswapCoinPublicKey)
            createConstructorContext(this.startingState, "0".repeat(64))// ZswapCoinPublicKey
        );
        this.circuitContext = {
            currentPrivateState,
            currentZswapLocalState,
            costModel: CostModel.initialCostModel(),
            currentQueryContext: new QueryContext(
                currentContractState.data,
                sampleContractAddress(),
            ),
        };
    }// end of constructor
        // addOrganizer
        public addOrganizer(newOrganizerPk: Uint8Array): void {
            this.circuitContext = this.contract.impureCircuits.addOrganizer(
                this.circuitContext,
                { bytes: newOrganizerPk },// transform ZswapPublicCoin -> Bytes<32>
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

        // test helper functions
        public getLedger(): Ledger {
            return ledger(this.circuitContext.currentQueryContext.state);
        }
        public getPrivateState(): PartyPrivateState {
            return this.circuitContext.currentPrivateState;
        }
}// end of class