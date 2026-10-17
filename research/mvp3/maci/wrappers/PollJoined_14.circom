pragma circom 2.0.0;
include "voter/PollJoined.circom";

component main {public [stateRoot]} = PollJoined(14);
