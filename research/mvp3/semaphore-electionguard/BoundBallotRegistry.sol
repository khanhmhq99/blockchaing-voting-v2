// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/// @notice Research-only hybrid registry. It does not validate ElectionGuard ballots.
contract BoundBallotRegistry {
    ISemaphore public immutable semaphore;
    uint256 public immutable groupId;
    uint256 public immutable groupRoot;
    uint256 public immutable electionScope;
    bytes32 public immutable electionId;
    bytes32 public immutable manifestDigest;
    bytes32 public immutable contextDigest;
    address public immutable owner;
    bool public open = true;

    bytes32 public constant BALLOT_DOMAIN = keccak256("HCMUT-SEG-BALLOT-V1");
    bytes32 public constant SCOPE_DOMAIN = keccak256("HCMUT-SEG-SCOPE-V1");

    mapping(uint256 => bool) public usedNullifier;
    bytes32[] public acceptedBallots;

    event BallotAccepted(uint256 indexed nullifier, bytes32 indexed ballotDigest, uint256 index);

    constructor(
        ISemaphore semaphore_,
        uint256 groupId_,
        uint256 groupRoot_,
        bytes32 electionId_,
        bytes32 manifestDigest_,
        bytes32 contextDigest_
    ) {
        semaphore = semaphore_;
        groupId = groupId_;
        groupRoot = groupRoot_;
        electionId = electionId_;
        manifestDigest = manifestDigest_;
        contextDigest = contextDigest_;
        electionScope = uint256(keccak256(abi.encode(SCOPE_DOMAIN, block.chainid, electionId_)));
        owner = msg.sender;
    }

    function expectedMessage(bytes32 ballotDigest) public view returns (uint256) {
        return uint256(keccak256(abi.encode(
            BALLOT_DOMAIN, block.chainid, electionId, manifestDigest, contextDigest, ballotDigest
        )));
    }

    function submit(bytes32 ballotDigest, ISemaphore.SemaphoreProof calldata proof) external {
        require(open, "CLOSED");
        require(ballotDigest != bytes32(0), "EMPTY_BALLOT");
        require(proof.merkleTreeRoot == groupRoot, "WRONG_ROOT");
        require(proof.scope == electionScope, "WRONG_SCOPE");
        require(proof.message == expectedMessage(ballotDigest), "WRONG_BALLOT");
        require(!usedNullifier[proof.nullifier], "DUPLICATE_NULLIFIER");
        require(semaphore.verifyProof(groupId, proof), "INVALID_MEMBERSHIP");
        usedNullifier[proof.nullifier] = true;
        acceptedBallots.push(ballotDigest);
        emit BallotAccepted(proof.nullifier, ballotDigest, acceptedBallots.length - 1);
    }

    function close() external {
        require(msg.sender == owner, "NOT_OWNER");
        open = false;
    }

    function acceptedCount() external view returns (uint256) {
        return acceptedBallots.length;
    }
}
