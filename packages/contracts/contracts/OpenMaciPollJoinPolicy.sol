// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Poll joining relies on MACI's membership proof and per-poll nullifier.
/// @dev This policy deliberately does not key eligibility to the sponsor address.
contract OpenMaciPollJoinPolicy is Ownable {
    address public guarded;

    event TargetSet(address indexed guarded);
    event Enforced(address indexed subject, address indexed guarded, bytes evidence);

    error TargetAlreadySet();
    error TargetNotSet();
    error TargetOnly();

    constructor() Ownable(msg.sender) {}

    function trait() external pure returns (string memory) {
        return "OpenMaciPollJoinV1";
    }

    function setTarget(address target) external onlyOwner {
        if (guarded != address(0)) revert TargetAlreadySet();
        if (target == address(0)) revert TargetNotSet();
        guarded = target;
        emit TargetSet(target);
    }

    function enforce(address subject, bytes calldata evidence) external {
        if (msg.sender != guarded || guarded == address(0)) revert TargetOnly();
        emit Enforced(subject, guarded, evidence);
    }
}
