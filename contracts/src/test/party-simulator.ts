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
    aliceAddress: string;
    aliceSk: Uint8Array;
    circuitContext: CircuitContext<PartyPrivateState>;


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
        this.circuitContext = {
            currentPrivateState,
            currentZswapLocalState,
            costModel: CostModel.initialCostModel(),
            currentQueryContext: new QueryContext(
                currentContractState.data,
                this.contractAddress,
            ),
        };
    }// end of constructor

    // contract circuit wrappers
    public addOrganizer(newOrganizer: Uint8Array): void {
        this.circuitContext = this.contract.impureCircuits.addOrganizer(
            this.circuitContext,
            { bytes: newOrganizer },// encoded from Uint8Array to Bytes
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