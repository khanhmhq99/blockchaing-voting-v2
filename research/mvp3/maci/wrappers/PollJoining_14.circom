pragma circom 2.0.0;
include "voter/PollJoining.circom";

component main {public [nullifier, stateRoot, pollPublicKey, pollId]} = PollJoining(14);
