const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TokenSnapshots", function () {
  let snap, alice, bob, carol, dave;
  const ZERO = ethers.ZeroAddress;
  const deploy = async (name, ...args) => { const c = await (await ethers.getContractFactory(name)).deploy(...args); await c.waitForDeployment(); return c; };

  beforeEach(async function () {
    [alice, bob, carol, dave] = await ethers.getSigners();
    snap = await deploy("TokenSnapshots");
  });

  describe("reading facts (what the contract reads itself)", function () {
    it("reads decimals, supply, owner() and the code hash of a normal token", async function () {
      const t = await deploy("MockToken", 1_000_000n * 10n ** 18n, bob.address);
      const f = await snap.readFacts(await t.getAddress());
      expect(f.hasDecimals).to.equal(true); expect(f.decimals).to.equal(18n);
      expect(f.hasTotalSupply).to.equal(true); expect(f.totalSupply).to.equal(1_000_000n * 10n ** 18n);
      expect(f.ownerSource).to.equal(1n); expect(f.owner).to.equal(bob.address);
      expect(f.codeHash).to.equal(ethers.keccak256(await ethers.provider.getCode(await t.getAddress())));
      expect(f.codeSize).to.equal(BigInt((await ethers.provider.getCode(await t.getAddress())).length / 2 - 1));
    });

    it("falls back to getOwner() and records which function answered", async function () {
      const t = await deploy("MockBscToken", carol.address);
      const f = await snap.readFacts(await t.getAddress());
      expect(f.ownerSource).to.equal(2n); expect(f.owner).to.equal(carol.address);
      expect(f.decimals).to.equal(9n);
    });

    it("records 'no owner answer' (not 'no owner') when the token has no owner function", async function () {
      const t = await deploy("MockNoOwnerToken");
      const f = await snap.readFacts(await t.getAddress());
      expect(f.ownerSource).to.equal(0n); expect(f.owner).to.equal(ZERO);
      expect(f.hasDecimals).to.equal(true); expect(f.totalSupply).to.equal(42n);
    });

    it("an owner() that returns the zero address is recorded as an answer (source 1), distinct from no answer", async function () {
      const t = await deploy("MockToken", 1n, ZERO);
      const f = await snap.readFacts(await t.getAddress());
      expect(f.ownerSource).to.equal(1n); expect(f.owner).to.equal(ZERO);
    });

    it("rejects decimals that don't fit a uint8 instead of truncating them", async function () {
      const t = await deploy("MockBigDecimals");
      const f = await snap.readFacts(await t.getAddress());
      expect(f.hasDecimals).to.equal(false); expect(f.decimals).to.equal(0n);
      expect(f.hasTotalSupply).to.equal(true);
    });

    it("rejects an owner value that isn't a valid address (dirty upper bytes)", async function () {
      const t = await deploy("MockAllOnes");
      const f = await snap.readFacts(await t.getAddress());
      expect(f.hasDecimals).to.equal(false);
      expect(f.ownerSource).to.equal(0n); expect(f.owner).to.equal(ZERO);
      expect(f.hasTotalSupply).to.equal(true); expect(f.totalSupply).to.equal(ethers.MaxUint256);
    });

    it("accepts only replies of exactly 32 bytes", async function () {
      const t = await deploy("MockLongReturn");
      const f = await snap.readFacts(await t.getAddress());
      expect(f.hasDecimals).to.equal(false); expect(f.hasTotalSupply).to.equal(false); expect(f.ownerSource).to.equal(0n);
    });

    it("a token that reverts yields no facts but never reverts the reader", async function () {
      const t = await deploy("MockReverting");
      const f = await snap.readFacts(await t.getAddress());
      expect(f.hasDecimals).to.equal(false); expect(f.hasTotalSupply).to.equal(false); expect(f.ownerSource).to.equal(0n);
      expect(f.codeSize > 0n).to.equal(true);
    });

    it("an address with no code reads as empty", async function () {
      const f = await snap.readFacts(bob.address);
      expect(f.codeSize).to.equal(0n); expect(f.hasDecimals).to.equal(false);
    });
  });

  describe("hostile tokens can't break or inflate a snapshot", function () {
    it("a token that burns all its gas only costs the capped amount, and the snapshot still succeeds", async function () {
      const t = await deploy("MockGasBurner");
      const tx = await snap.connect(alice).snapshot(await t.getAddress(), "");
      const gas = (await tx.wait()).gasUsed;
      expect(gas < 600_000n, "gas used " + gas).to.equal(true);
      const s = await snap.getSnapshot(0);
      expect(s.facts.hasDecimals).to.equal(false); expect(s.facts.ownerSource).to.equal(0n);
    });

    it("a token that returns a huge blob doesn't make the snapshot expensive", async function () {
      const t = await deploy("MockHugeReturn");
      const tx = await snap.connect(alice).snapshot(await t.getAddress(), "");
      expect((await tx.wait()).gasUsed < 600_000n).to.equal(true);
    });

    it("the reader function is also bounded when called directly", async function () {
      const t = await deploy("MockGasBurner");
      const est = await snap.readFacts.estimateGas(await t.getAddress());
      expect(est < 600_000n).to.equal(true);
    });
  });

  describe("taking snapshots", function () {
    let token, tokenAddr;
    beforeEach(async function () {
      token = await deploy("MockToken", 1000n, bob.address); tokenAddr = await token.getAddress();
    });

    it("records who, when, what the contract read, and the hash of the reported text", async function () {
      const reported = '{"v":1,"holders":"reported"}';
      const tx = await snap.connect(carol).snapshot(tokenAddr, reported);
      const rc = await tx.wait(); const block = await ethers.provider.getBlock(rc.blockNumber);
      const s = await snap.getSnapshot(0);
      expect(s.token).to.equal(tokenAddr); expect(s.snapshotter).to.equal(carol.address);
      expect(s.blockNumber).to.equal(BigInt(rc.blockNumber)); expect(s.timestamp).to.equal(BigInt(block.timestamp));
      expect(s.facts.totalSupply).to.equal(1000n); expect(s.facts.owner).to.equal(bob.address);
      expect(s.reportedHash).to.equal(ethers.keccak256(ethers.toUtf8Bytes(reported)));
    });

    it("emits the reported text in an event, and its hash matches what's stored", async function () {
      const reported = '{"explorer":{"verified":true}}';
      await expect(snap.connect(alice).snapshot(tokenAddr, reported)).to.emit(snap, "SnapshotTaken");
      const logs = await snap.queryFilter(snap.filters.SnapshotTaken(0n));
      expect(logs.length).to.equal(1);
      expect(logs[0].args.reported).to.equal(reported);
      expect(ethers.keccak256(ethers.toUtf8Bytes(logs[0].args.reported))).to.equal((await snap.getSnapshot(0)).reportedHash);
    });

    it("works with an empty reported record", async function () {
      await expect(snap.connect(alice).snapshot(tokenAddr, "")).to.not.be.reverted;
    });

    it("accepts 4096 bytes of reported text and rejects 4097", async function () {
      await expect(snap.snapshot(tokenAddr, "a".repeat(4096))).to.not.be.reverted;
      await expect(snap.snapshot(tokenAddr, "a".repeat(4097))).to.be.revertedWith("Reported record is too long");
    });

    it("refuses an address with no contract code", async function () {
      await expect(snap.snapshot(bob.address, "")).to.be.revertedWith("No contract code at that address");
    });

    it("anyone can snapshot any token, any number of times, and each record names its snapshotter", async function () {
      await snap.connect(alice).snapshot(tokenAddr, "a");
      await snap.connect(dave).snapshot(tokenAddr, "b");
      await snap.connect(alice).snapshot(tokenAddr, "c");
      expect(await snap.snapshotCount()).to.equal(3n);
      expect((await snap.getSnapshot(1)).snapshotter).to.equal(dave.address);
    });

    it("keeps a per-token index in order, separate for each token", async function () {
      const other = await deploy("MockNoOwnerToken");
      await snap.snapshot(tokenAddr, "1");
      await snap.snapshot(await other.getAddress(), "2");
      await snap.snapshot(tokenAddr, "3");
      expect(await snap.tokenSnapshotCount(tokenAddr)).to.equal(2n);
      expect(await snap.tokenSnapshotIdAt(tokenAddr, 0)).to.equal(0n);
      expect(await snap.tokenSnapshotIdAt(tokenAddr, 1)).to.equal(2n);
      expect(await snap.tokenSnapshotCount(await other.getAddress())).to.equal(1n);
      await expect(snap.tokenSnapshotIdAt(tokenAddr, 2)).to.be.revertedWith("No such snapshot");
    });

    it("LATER CHANGES SHOW: a new snapshot differs from the old one, and the old one is untouched", async function () {
      await snap.snapshot(tokenAddr, "before");
      await token.mint(500n); await token.setOwner(dave.address); await token.setDecimals(6);
      await snap.snapshot(tokenAddr, "after");
      const before = await snap.getSnapshot(0), after = await snap.getSnapshot(1);
      expect(before.facts.totalSupply).to.equal(1000n); expect(after.facts.totalSupply).to.equal(1500n);
      expect(before.facts.owner).to.equal(bob.address); expect(after.facts.owner).to.equal(dave.address);
      expect(before.facts.decimals).to.equal(18n); expect(after.facts.decimals).to.equal(6n);
      expect(before.facts.codeHash).to.equal(after.facts.codeHash); // same code, so the hash is unchanged
    });

    it("the live reader matches a fresh snapshot exactly, so stored and current values are comparable", async function () {
      await snap.snapshot(tokenAddr, "");
      const stored = (await snap.getSnapshot(0)).facts, live = await snap.readFacts(tokenAddr);
      expect(stored.codeHash).to.equal(live.codeHash); expect(stored.totalSupply).to.equal(live.totalSupply);
      expect(stored.owner).to.equal(live.owner); expect(stored.ownerSource).to.equal(live.ownerSource); expect(stored.decimals).to.equal(live.decimals);
    });

    it("rejects an id that doesn't exist", async function () {
      await expect(snap.getSnapshot(0)).to.be.revertedWith("No such snapshot");
    });
  });

  describe("structural guarantees", function () {
    it("holds no funds: plain transfers and calls with data both revert", async function () {
      const addr = await snap.getAddress();
      await expect(alice.sendTransaction({ to: addr, value: 1n })).to.be.reverted;
      await expect(alice.sendTransaction({ to: addr, value: 1n, data: "0x1234" })).to.be.reverted;
      expect(await ethers.provider.getBalance(addr)).to.equal(0n);
    });

    it("has no payable function", async function () {
      expect(snap.interface.fragments.filter((f) => f.type === "function" && f.payable).length).to.equal(0);
    });

    it("exposes exactly the expected functions: no owner, admin, fee, or setter exists", async function () {
      const names = snap.interface.fragments.filter((f) => f.type === "function").map((f) => f.name).sort();
      expect(names).to.deep.equal(["MAX_REPORTED_BYTES", "READ_GAS", "getSnapshot", "readFacts", "snapshot", "snapshotCount", "tokenSnapshotCount", "tokenSnapshotIdAt"]);
    });
  });
});
