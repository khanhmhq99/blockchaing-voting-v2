// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Isolated research contract. Do not deploy to a public network or use for real voters.
interface ISemaphoreV4 {
    struct SemaphoreProof {
        uint256 merkleTreeDepth;
        uint256 merkleTreeRoot;
        uint256 nullifier;
        uint256 message;
        uint256 scope;
        uint256[8] points;
    }

    function verifyProof(uint256 groupId, SemaphoreProof calldata proof) external view returns (bool);
}

interface IMaciV3Signup {
    struct PublicKey {
        uint256 x;
        uint256 y;
    }

    function signUp(PublicKey calldata publicKey, bytes calldata policyData) external;
}

/// @notice Research-only atomic Semaphore authorization and MACI v3 signup policy.
/// @dev The Semaphore group must be dedicated to one election. Issuer honesty is external.
contract SemaphoreMaciRegistration {
    uint256 private constant SNARK_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    bytes32 private constant KEY_DOMAIN = keccak256("HCMUT_SEMAPHORE_MACI_SIGNUP_V1");

    address public immutable owner;
    ISemaphoreV4 public immutable semaphore;
    uint256 public immutable groupId;
    uint256 public immutable scope;
    address public guarded;
    bytes32 private pendingKey;
    mapping(uint256 => bool) public spentNullifiers;
    mapping(bytes32 => bool) public registeredKeys;

    error Unauthorized();
    error InvalidTarget();
    error InvalidProofScope();
    error InvalidProofMessage();
    error InvalidProof();
    error NullifierAlreadyUsed();
    error InvalidPolicyCall();
    error KeyAlreadyRegistered();

    constructor(address semaphore_, uint256 groupId_) {
        if (semaphore_ == address(0)) revert InvalidTarget();
        owner = msg.sender;
        semaphore = ISemaphoreV4(semaphore_);
        groupId = groupId_;
        // A distinct scope avoids a stable public nullifier across elections, even if group IDs repeat.
        scope = uint256(keccak256(abi.encode(KEY_DOMAIN, block.chainid, address(this), groupId_))) % SNARK_FIELD;
    }

    function trait() external pure returns (string memory) {
        return "SemaphoreMaciRegistrationResearchV1";
    }

    function setTarget(address maci) external {
        if (msg.sender != owner) revert Unauthorized();
        if (guarded != address(0) || maci == address(0)) revert InvalidTarget();
        guarded = maci;
    }

    /// @dev Explicit digest-to-field reduction is part of this PoC's versioned encoding.
    function keyMessage(IMaciV3Signup.PublicKey calldata publicKey) public view returns (uint256) {
        if (guarded == address(0)) revert InvalidTarget();
        return uint256(keccak256(abi.encode(
            KEY_DOMAIN, block.chainid, address(this), guarded, groupId, publicKey.x, publicKey.y
        ))) % SNARK_FIELD;
    }

    /// @dev Semaphore nullifier consumption and MACI signup revert together on any failure.
    function register(
        IMaciV3Signup.PublicKey calldata publicKey,
        ISemaphoreV4.SemaphoreProof calldata proof
    ) external {
        if (guarded == address(0)) revert InvalidTarget();
        if (proof.scope != scope) revert InvalidProofScope();
        if (proof.message != keyMessage(publicKey)) revert InvalidProofMessage();
        bytes32 keyHash = keccak256(abi.encode(publicKey.x, publicKey.y));
        if (registeredKeys[keyHash]) revert KeyAlreadyRegistered();
        if (spentNullifiers[proof.nullifier]) revert NullifierAlreadyUsed();
        if (!semaphore.verifyProof(groupId, proof)) revert InvalidProof();

        // Use a wrapper-owned nullifier. Anyone can call Semaphore.validateProof directly;
        // relying on that global spent set would allow public front-running of registration.
        spentNullifiers[proof.nullifier] = true;
        pendingKey = keyHash;
        IMaciV3Signup(guarded).signUp(publicKey, abi.encode(keyHash));
        pendingKey = bytes32(0);
        if (!registeredKeys[keyHash]) revert InvalidPolicyCall();
    }

    /// @dev MACI calls its policy with msg.sender equal to this wrapper, not the voter.
    function enforce(address subject, bytes calldata evidence) external {
        if (msg.sender != guarded || subject != address(this) || pendingKey == bytes32(0)) {
            revert InvalidPolicyCall();
        }
        bytes32 keyHash = abi.decode(evidence, (bytes32));
        if (keyHash != pendingKey) revert InvalidPolicyCall();
        if (registeredKeys[keyHash]) revert KeyAlreadyRegistered();
        registeredKeys[keyHash] = true;
    }
}
