// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IBallotProofVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[3] calldata publicSignals
    ) external view returns (bool);
}

// Research-only proof composition probe. It does not authenticate ciphertext
// bytes against the DAVINCI inputs_hash and must never accept real ballots.
contract CompositionProbe {
    ISemaphore public immutable semaphore;
    IBallotProofVerifier public immutable ballotVerifier;
    uint256 public immutable groupId;
    uint256 public immutable frozenRoot;
    uint256 public immutable electionScope;

    constructor(address semaphoreAddress, address ballotVerifierAddress, uint256 id, uint256 root, uint256 scope) {
        semaphore = ISemaphore(semaphoreAddress);
        ballotVerifier = IBallotProofVerifier(ballotVerifierAddress);
        groupId = id;
        frozenRoot = root;
        electionScope = scope;
    }

    function validate(
        ISemaphore.SemaphoreProof calldata membership,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[3] calldata signals
    ) external {
        require(membership.merkleTreeRoot == frozenRoot, "WRONG_ROOT");
        require(membership.scope == electionScope, "WRONG_SCOPE");
        require(membership.message == signals[2], "WRONG_MESSAGE");
        require(signals[0] == 0, "ADDRESS_EXPOSED");
        require(ballotVerifier.verifyProof(a, b, c, signals), "INVALID_BALLOT_PROOF");
        semaphore.validateProof(groupId, membership);
    }
}
