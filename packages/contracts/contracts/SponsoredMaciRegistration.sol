// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMaciSignup {
    struct PublicKey {
        uint256 x;
        uint256 y;
    }

    function signUp(PublicKey calldata publicKey, bytes calldata policyData) external;
}

/// @notice MACI v3 sign-up policy and entry point for issuer-authorized, sponsored registration.
/// @dev MACI passes only msg.sender and policy data to its policy. Calling MACI through this
/// contract binds the supplied key to the signed authorization before policy enforcement.
contract SponsoredMaciRegistration is EIP712, Ownable, ReentrancyGuard {
    bytes32 private constant REGISTRATION_TYPEHASH =
        keccak256("Registration(bytes32 ticket,uint256 publicKeyX,uint256 publicKeyY,uint256 deadline)");

    address public immutable issuer;
    address public guarded;
    bytes32 private pendingEvidence;
    mapping(bytes32 => bool) public usedTickets;
    mapping(bytes32 => bool) public registeredKeys;

    event TargetSet(address indexed guarded);
    event Enforced(address indexed subject, address indexed guarded, bytes evidence);

    error TargetAlreadySet();
    error TargetNotSet();
    error TargetOnly();
    error InvalidAuthorization();
    error ExpiredAuthorization();
    error TicketAlreadyUsed();
    error KeyAlreadyRegistered();

    constructor(address issuer_) EIP712("HCMUT MACI Registration", "1") Ownable(msg.sender) {
        if (issuer_ == address(0)) revert InvalidAuthorization();
        issuer = issuer_;
    }

    function trait() external pure returns (string memory) {
        return "SponsoredMaciRegistrationV1";
    }

    function setTarget(address target) external onlyOwner {
        if (guarded != address(0)) revert TargetAlreadySet();
        if (target == address(0)) revert TargetNotSet();
        guarded = target;
        emit TargetSet(target);
    }

    function register(
        IMaciSignup.PublicKey calldata publicKey,
        bytes32 ticket,
        uint256 deadline,
        bytes calldata issuerSignature
    ) external nonReentrant {
        if (guarded == address(0)) revert TargetNotSet();
        if (ticket == bytes32(0)) revert InvalidAuthorization();
        if (block.timestamp > deadline) revert ExpiredAuthorization();
        if (usedTickets[ticket]) revert TicketAlreadyUsed();

        bytes32 keyHash = keccak256(abi.encode(publicKey.x, publicKey.y));
        if (registeredKeys[keyHash]) revert KeyAlreadyRegistered();
        bytes32 structHash = keccak256(
            abi.encode(REGISTRATION_TYPEHASH, ticket, publicKey.x, publicKey.y, deadline)
        );
        if (ECDSA.recover(_hashTypedDataV4(structHash), issuerSignature) != issuer) {
            revert InvalidAuthorization();
        }

        bytes memory evidence = abi.encode(ticket, publicKey.x, publicKey.y, deadline);
        pendingEvidence = keccak256(evidence);
        IMaciSignup(guarded).signUp(publicKey, evidence);
        pendingEvidence = bytes32(0);
        if (!usedTickets[ticket] || !registeredKeys[keyHash]) revert InvalidAuthorization();
    }

    /// @dev MACI supplies this contract as subject; direct MACI.signUp calls fail.
    function enforce(address subject, bytes calldata evidence) external {
        if (msg.sender != guarded || guarded == address(0)) revert TargetOnly();
        if (subject != address(this) || pendingEvidence == bytes32(0)) revert InvalidAuthorization();
        if (keccak256(evidence) != pendingEvidence) revert InvalidAuthorization();
        (bytes32 ticket, uint256 x, uint256 y, ) = abi.decode(evidence, (bytes32, uint256, uint256, uint256));
        bytes32 keyHash = keccak256(abi.encode(x, y));
        if (usedTickets[ticket]) revert TicketAlreadyUsed();
        if (registeredKeys[keyHash]) revert KeyAlreadyRegistered();
        usedTickets[ticket] = true;
        registeredKeys[keyHash] = true;
        emit Enforced(subject, guarded, evidence);
    }
}
