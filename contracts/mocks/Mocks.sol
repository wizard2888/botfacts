// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Test fixtures only. These are never deployed to a real network.

contract MockToken {
    string public name = "Mock Token";
    string public symbol = "MOCK";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    address public owner;
    constructor(uint256 supply, address owner_) { totalSupply = supply; owner = owner_; }
    function setOwner(address o) external { owner = o; }
    function mint(uint256 n) external { totalSupply += n; }
    function setDecimals(uint8 d) external { decimals = d; }
}

/// BNB-style: exposes getOwner() instead of owner()
contract MockBscToken {
    uint8 public decimals = 9;
    uint256 public totalSupply = 1_000_000;
    address private _o;
    constructor(address o) { _o = o; }
    function getOwner() external view returns (address) { return _o; }
}

/// Has decimals and supply but no owner function of any kind
contract MockNoOwnerToken {
    function decimals() external pure returns (uint8) { return 6; }
    function totalSupply() external pure returns (uint256) { return 42; }
}

/// decimals() returns 256, which doesn't fit a uint8
contract MockBigDecimals {
    function decimals() external pure returns (uint256) { return 256; }
    function totalSupply() external pure returns (uint256) { return 5; }
}

/// Answers every call with 0xFFFF...FFFF
contract MockAllOnes {
    fallback() external { assembly { mstore(0, not(0)) return(0, 32) } }
}

/// Answers every call with 64 bytes instead of 32
contract MockLongReturn {
    fallback() external { assembly { return(0, 64) } }
}

/// Never finishes: burns all the gas it is given
contract MockGasBurner {
    fallback() external { assembly { for {} 1 {} {} } }
}

/// Returns a large blob of data for every call
contract MockHugeReturn {
    fallback() external { assembly { return(0, 19200) } }
}

/// Reverts on every call
contract MockReverting {
    fallback() external { revert("nope"); }
}
