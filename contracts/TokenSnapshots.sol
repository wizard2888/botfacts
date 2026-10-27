// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TokenSnapshots
/// @notice Anyone can freeze a token's answers into a permanent on-chain snapshot, so that later
///         changes show. Facts only: this contract records what it reads and what was reported. It
///         never scores, rates, or judges anything.
///
/// @dev TWO KINDS OF FACT, KEPT SEPARATE ON PURPOSE
///      1. READ BY THE CONTRACT (struct Facts): code hash and size, decimals, total supply, and an
///         owner address if the token answers owner() or getOwner(). The contract reads these itself
///         at snapshot time, so the snapshotter cannot fake them.
///      2. REPORTED BY THE SNAPSHOTTER (the `reported` string): things only an off-chain explorer
///         knows, such as holder concentration or verified-source status. The contract cannot check
///         these. It stores only a hash of the string and emits the text in an event, together with
///         the snapshotter's address, so anyone can see who reported what. Treat it as a claim.
///
///      WHAT THIS CONTRACT DOES NOT DO
///      - No owner, admin, fee, or setter: every rule below is fixed at deployment.
///      - Holds no funds: nothing is payable, so sending BOT to it reverts.
///      - A missing fact is not a clean bill of health. If a token has no owner() function, the
///        snapshot records "no owner answer", not "no owner".
///      - Anyone can take any number of snapshots of any token, including misleading ones. The UI
///        shows who took each snapshot. Snapshots from different people are independent records.
contract TokenSnapshots {
    uint256 public constant MAX_REPORTED_BYTES = 4096;
    uint256 public constant READ_GAS = 50_000; // gas cap for each read, so a hostile token can't burn the caller's gas

    struct Facts {
        bytes32 codeHash;
        uint32 codeSize;
        bool hasDecimals;
        uint8 decimals;
        bool hasTotalSupply;
        uint256 totalSupply;
        uint8 ownerSource; // 0 = no valid answer, 1 = owner(), 2 = getOwner()
        address owner;
    }

    struct Snapshot {
        address token;
        address snapshotter;
        uint64 blockNumber;
        uint64 timestamp;
        Facts facts;
        bytes32 reportedHash; // keccak256 of the reported string emitted in the SnapshotTaken event
    }

    Snapshot[] private _snapshots;
    mapping(address => uint256[]) private _idsByToken;

    event SnapshotTaken(uint256 indexed id, address indexed token, address indexed snapshotter, uint64 blockNumber, string reported);

    /// @notice Freeze a token's current answers. `reported` is an optional text record (the site
    ///         sends compact JSON) that the contract stores only as a hash plus the event.
    function snapshot(address token, string calldata reported) external returns (uint256 id) {
        require(token.code.length > 0, "No contract code at that address");
        require(bytes(reported).length <= MAX_REPORTED_BYTES, "Reported record is too long");

        Facts memory f = readFacts(token);
        id = _snapshots.length;
        _snapshots.push(
            Snapshot({
                token: token,
                snapshotter: msg.sender,
                blockNumber: uint64(block.number),
                timestamp: uint64(block.timestamp),
                facts: f,
                reportedHash: keccak256(bytes(reported))
            })
        );
        _idsByToken[token].push(id);
        emit SnapshotTaken(id, token, msg.sender, uint64(block.number), reported);
    }

    /// @notice What the contract can read about a token right now. This is the exact reader that
    ///         `snapshot` uses, so a stored snapshot and this view are always directly comparable.
    function readFacts(address token) public view returns (Facts memory f) {
        f.codeHash = token.codehash;
        f.codeSize = uint32(token.code.length);

        (bool ok, uint256 v) = _read(token, 0x313ce567); // decimals()
        if (ok && v <= type(uint8).max) { f.hasDecimals = true; f.decimals = uint8(v); }

        (ok, v) = _read(token, 0x18160ddd); // totalSupply()
        if (ok) { f.hasTotalSupply = true; f.totalSupply = v; }

        (ok, v) = _read(token, 0x8da5cb5b); // owner()
        if (ok && v <= type(uint160).max) {
            f.ownerSource = 1;
            f.owner = address(uint160(v));
        } else {
            (ok, v) = _read(token, 0x893d20e8); // getOwner()
            if (ok && v <= type(uint160).max) {
                f.ownerSource = 2;
                f.owner = address(uint160(v));
            }
        }
    }

    // --- Views ---

    function snapshotCount() external view returns (uint256) {
        return _snapshots.length;
    }

    function getSnapshot(uint256 id) external view returns (Snapshot memory) {
        require(id < _snapshots.length, "No such snapshot");
        return _snapshots[id];
    }

    function tokenSnapshotCount(address token) external view returns (uint256) {
        return _idsByToken[token].length;
    }

    function tokenSnapshotIdAt(address token, uint256 index) external view returns (uint256) {
        require(index < _idsByToken[token].length, "No such snapshot");
        return _idsByToken[token][index];
    }

    /// @dev A single capped, view-only call. It accepts only a reply of exactly 32 bytes, and copies
    ///      only those 32 bytes, so a token can't make this contract copy huge return data or spend
    ///      more than READ_GAS.
    function _read(address token, bytes4 selector) private view returns (bool ok, uint256 value) {
        uint256 g = READ_GAS;
        assembly ("memory-safe") {
            mstore(0, selector)
            let success := staticcall(g, token, 0, 4, 0, 0)
            if and(success, eq(returndatasize(), 32)) {
                returndatacopy(0, 0, 32)
                value := mload(0)
                ok := 1
            }
        }
    }
}
