// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Public-choice research baseline. Synthetic voters only.
contract BasicVoting is Ownable {
    enum State { Draft, Upcoming, Active, Closed, Cancelled }
    struct Election {
        bytes32 manifestHash;
        uint64 startTime;
        uint64 endTime;
        uint32 candidateCount;
        uint32 registeredCandidates;
        bool frozen;
        bool cancelled;
        bool finalized;
        uint256 totalVotes;
        uint256 eligibleCount;
    }
    uint256 public electionCount;
    mapping(uint256 => Election) private elections;
    mapping(uint256 => mapping(address => bool)) public eligible;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(uint32 => uint256)) public candidateVotes;
    mapping(uint256 => mapping(uint32 => bytes32)) public candidateMetadataHash;

    error InvalidElection();
    error InvalidConfiguration();
    error InvalidState();
    error NotEligible();
    error AlreadyVoted();
    error InvalidCandidate();

    event ElectionCreated(uint256 indexed electionId, bytes32 manifestHash);
    event ElectionConfigured(uint256 indexed electionId, bytes32 manifestHash);
    event CandidateAdded(uint256 indexed electionId, uint32 indexed candidateId, bytes32 metadataHash);
    event VoterAuthorized(uint256 indexed electionId, address indexed voter, bool authorized);
    event ElectionFrozen(uint256 indexed electionId);
    event VoteCast(uint256 indexed electionId, address indexed voter, uint32 candidateId);
    event ElectionFinalized(uint256 indexed electionId, uint256 totalVotes);
    event ElectionClosed(uint256 indexed electionId, uint256 totalVotes);
    event ElectionCancelled(uint256 indexed electionId, bytes32 reasonHash);

    constructor() Ownable(msg.sender) {}
    // Immutable administrative identity for reproducible baseline deployments.
    function transferOwnership(address) public pure override { revert InvalidState(); }
    function renounceOwnership() public pure override { revert InvalidState(); }

    function createElection(uint64 start, uint64 end, uint32 count, bytes32 manifest) external onlyOwner returns (uint256 id) {
        validateConfiguration(start, end, count, manifest);
        id = ++electionCount;
        elections[id] = Election(manifest, start, end, count, 0, false, false, false, 0, 0);
        emit ElectionCreated(id, manifest);
    }

    function configureElection(uint256 id, uint64 start, uint64 end, uint32 count, bytes32 manifest) external onlyOwner {
        Election storage e = requireDraft(id);
        validateConfiguration(start, end, count, manifest);
        e.startTime = start; e.endTime = end; e.candidateCount = count; e.manifestHash = manifest;
        e.registeredCandidates = 0;
        emit ElectionConfigured(id, manifest);
    }

    function registerCandidates(uint256 id, bytes32[] calldata hashes) external onlyOwner {
        Election storage e = requireDraft(id);
        if (hashes.length == 0 || hashes.length > 100 || e.registeredCandidates + hashes.length > e.candidateCount) revert InvalidConfiguration();
        for (uint256 i; i < hashes.length; ++i) {
            if (hashes[i] == bytes32(0)) revert InvalidConfiguration();
            uint32 candidateId = e.registeredCandidates++;
            candidateMetadataHash[id][candidateId] = hashes[i];
            emit CandidateAdded(id, candidateId, hashes[i]);
        }
    }

    function setEligibility(uint256 id, address[] calldata voters, bool authorized) external onlyOwner {
        requireDraft(id);
        if (voters.length == 0 || voters.length > 200) revert InvalidConfiguration();
        for (uint256 i; i < voters.length; ++i) {
            if (voters[i] == address(0)) revert InvalidConfiguration();
            if (eligible[id][voters[i]] != authorized) {
                eligible[id][voters[i]] = authorized;
                if (authorized) ++elections[id].eligibleCount; else --elections[id].eligibleCount;
                emit VoterAuthorized(id, voters[i], authorized);
            }
        }
    }

    function freeze(uint256 id) external onlyOwner {
        Election storage e = requireDraft(id);
        if (block.timestamp >= e.startTime || e.registeredCandidates != e.candidateCount) revert InvalidState();
        e.frozen = true;
        emit ElectionFrozen(id);
    }

    function vote(uint256 id, uint32 candidateId) external {
        Election storage e = requireElection(id);
        if (state(id) != State.Active) revert InvalidState();
        if (!eligible[id][msg.sender]) revert NotEligible();
        if (hasVoted[id][msg.sender]) revert AlreadyVoted();
        if (candidateId >= e.candidateCount) revert InvalidCandidate();
        hasVoted[id][msg.sender] = true;
        ++candidateVotes[id][candidateId];
        ++e.totalVotes;
        emit VoteCast(id, msg.sender, candidateId);
    }

    function finalize(uint256 id) external onlyOwner {
        Election storage e = requireElection(id);
        if (state(id) != State.Closed || e.finalized) revert InvalidState();
        e.finalized = true;
        emit ElectionFinalized(id, e.totalVotes);
        emit ElectionClosed(id, e.totalVotes);
    }

    function cancel(uint256 id, bytes32 reasonHash) external onlyOwner {
        Election storage e = requireElection(id);
        if (e.finalized || e.cancelled || reasonHash == bytes32(0)) revert InvalidState();
        e.cancelled = true;
        emit ElectionCancelled(id, reasonHash);
    }

    function getElection(uint256 id) external view returns (Election memory) { return requireElection(id); }
    function state(uint256 id) public view returns (State) {
        Election storage e = requireElection(id);
        if (e.cancelled) return State.Cancelled;
        if (e.finalized) return State.Closed;
        if (!e.frozen) return State.Draft;
        if (block.timestamp < e.startTime) return State.Upcoming;
        if (block.timestamp < e.endTime) return State.Active;
        return State.Closed;
    }
    function requireElection(uint256 id) private view returns (Election storage e) {
        if (id == 0 || id > electionCount) revert InvalidElection();
        return elections[id];
    }
    function requireDraft(uint256 id) private view returns (Election storage e) {
        e = requireElection(id);
        if (e.frozen || e.cancelled || e.finalized) revert InvalidState();
    }
    function validateConfiguration(uint64 start, uint64 end, uint32 count, bytes32 manifest) private view {
        if (start <= block.timestamp || end <= start || count < 2 || count > 100 || manifest == bytes32(0)) revert InvalidConfiguration();
    }
}
