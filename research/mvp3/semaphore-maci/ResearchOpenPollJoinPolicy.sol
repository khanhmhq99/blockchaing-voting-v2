// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Isolated synthetic poll policy; MACI's joining proof/nullifier enforce membership.
contract ResearchOpenPollJoinPolicy {
    address public immutable owner;
    address public guarded;

    error Unauthorized();
    error InvalidTarget();
    error TargetOnly();

    constructor() { owner = msg.sender; }

    function trait() external pure returns (string memory) { return "ResearchOpenPollJoinV1"; }

    function setTarget(address target) external {
        if (msg.sender != owner) revert Unauthorized();
        if (guarded != address(0) || target == address(0)) revert InvalidTarget();
        guarded = target;
    }

    function enforce(address, bytes calldata) external view {
        if (msg.sender != guarded || guarded == address(0)) revert TargetOnly();
    }
}
