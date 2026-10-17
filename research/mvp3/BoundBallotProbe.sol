// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IPublicBallotVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[72] calldata publicSignals
    ) external view returns (bool);
}

// Research only. The patched DAVINCI circuit makes the complete ballot statement
// public, so its existing constrained inputs_hash can be checked without a new
// Solidity Poseidon implementation. This is not an audited voting contract.
contract BoundBallotProbe {
    uint256 private constant FIELD = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    uint8 public constant PROTOCOL_VERSION = 1;
    ISemaphore public immutable semaphore;
    IPublicBallotVerifier public immutable ballotVerifier;
    uint256 public immutable groupId;
    uint256 public immutable frozenRoot;
    uint256 public immutable electionScope;
    uint256 public immutable processId;
    uint256 public immutable packedBallotMode;
    uint256 public immutable keyX;
    uint256 public immutable keyY;
    bytes32 public immutable manifestHash;
    uint64 public immutable electionId;
    bytes32 public immutable candidateId0;
    bytes32 public immutable candidateId1;

    event BallotAccepted(
        uint256 indexed nullifier,
        uint256 indexed voteId,
        uint256 inputsHash,
        bytes32 manifestDigest,
        uint256[4][16] ciphertext
    );

    constructor(
        address semaphoreAddress,
        address ballotVerifierAddress,
        uint256 id,
        uint256 root,
        bytes memory manifest,
        uint256[2] memory electionKey
    ) {
        require(semaphoreAddress != address(0) && ballotVerifierAddress != address(0), "BAD_VERIFIER");
        require(root < FIELD && electionKey[0] < FIELD && electionKey[1] < FIELD, "NONCANONICAL_FIELD");
        // Canonical manifest v1 = abi.encode(uint8 version, uint64 electionId,
        // bytes32[2] ordered candidate IDs). ABI static encoding is 128 bytes.
        require(manifest.length == 128, "BAD_MANIFEST_LENGTH");
        (uint8 version, uint64 idValue, bytes32[2] memory candidates) =
            abi.decode(manifest, (uint8, uint64, bytes32[2]));
        require(version == PROTOCOL_VERSION && idValue != 0, "BAD_MANIFEST_VERSION");
        require(candidates[0] != bytes32(0) && candidates[1] != bytes32(0)
            && candidates[0] != candidates[1], "BAD_CANDIDATES");
        require(keccak256(manifest) == keccak256(abi.encode(version, idValue, candidates)), "NONCANONICAL_MANIFEST");
        semaphore = ISemaphore(semaphoreAddress);
        ballotVerifier = IPublicBallotVerifier(ballotVerifierAddress);
        groupId = id;
        frozenRoot = root;
        manifestHash = keccak256(manifest);
        electionId = idValue;
        candidateId0 = candidates[0];
        candidateId1 = candidates[1];
        keyX = electionKey[0];
        keyY = electionKey[1];
        // The research probe fixes two candidates and exact-one 0/1 choices.
        packedBallotMode = uint256(2) | (uint256(2) << 8) | (uint256(1) << 17)
            | (uint256(1) << 25) | (uint256(1) << 121) | (uint256(1) << 184);
        processId = _fieldDomain("HCMUT-MVP3-PROCESS-V1", manifestHash);
        electionScope = _fieldDomain("HCMUT-MVP3-SCOPE-V1", manifestHash);
    }

    function _fieldDomain(string memory label, bytes32 digest) private view returns (uint256) {
        // Rejection sampling, not modulo reduction: each accepted digest is a
        // canonical BN254 scalar and includes chain, deployment and manifest.
        for (uint256 counter = 0; counter < 256; counter++) {
            uint256 candidate = uint256(keccak256(abi.encode(label, block.chainid, address(this), digest, counter)));
            if (candidate < FIELD) return candidate;
        }
        revert("DOMAIN_DERIVATION_FAILED");
    }

    function accept(
        ISemaphore.SemaphoreProof calldata membership,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256 voteId,
        uint256[4][16] calldata ciphertext,
        bytes calldata manifest
    ) external {
        require(membership.merkleTreeRoot == frozenRoot, "WRONG_ROOT");
        require(membership.scope == electionScope, "WRONG_SCOPE");
        require(keccak256(manifest) == manifestHash, "WRONG_MANIFEST");
        uint256[72] memory signals;
        signals[0] = packedBallotMode;
        signals[1] = 0; // Never expose the DAVINCI address input.
        signals[2] = 1; // One vote has unit weight.
        signals[3] = processId;
        signals[4] = voteId;
        signals[5] = keyX;
        signals[6] = keyY;
        for (uint256 i = 0; i < 16; i++) {
            for (uint256 j = 0; j < 4; j++) {
                require(ciphertext[i][j] < FIELD, "NONCANONICAL_FIELD");
                signals[7 + 4 * i + j] = ciphertext[i][j];
            }
        }
        signals[71] = membership.message;
        require(ballotVerifier.verifyProof(a, b, c, signals), "INVALID_BALLOT_PROOF");
        semaphore.validateProof(groupId, membership);
        emit BallotAccepted(membership.nullifier, voteId, membership.message, manifestHash, ciphertext);
    }
}
