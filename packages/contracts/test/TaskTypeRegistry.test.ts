import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { getAddress, keccak256, stringToBytes, zeroAddress } from "viem";

const USDC = (n: bigint) => n * 1_000_000n;

const TT_A = keccak256(stringToBytes("blockscout_contract_source"));
const TT_B = keccak256(stringToBytes("defillama_tvl"));
const TT_UNKNOWN = keccak256(stringToBytes("nope"));
const ZERO_ID = `0x${"00".repeat(32)}` as `0x${string}`;

const TT_A_NAME = "blockscout_contract_source";
const TT_A_SCHEMA = "ipfs://bafyTBD";
const TT_A_MAX_TIME = 15n;
const TT_A_MIN_BUDGET = USDC(1n) / 100n; // $0.01

describe("TaskTypeRegistry", function () {
  async function deployFixture() {
    const [owner, other, stranger] = await hre.viem.getWalletClients();
    const registry = await hre.viem.deployContract("TaskTypeRegistry");
    const publicClient = await hre.viem.getPublicClient();
    return { registry, owner, other, stranger, publicClient };
  }

  async function as(registry: any, wallet: any) {
    return hre.viem.getContractAt("TaskTypeRegistry", registry.address, {
      client: { wallet },
    });
  }

  describe("Deployment", function () {
    it("sets deployer as owner", async function () {
      const { registry, owner } = await loadFixture(deployFixture);
      expect(getAddress(await registry.read.owner())).to.equal(getAddress(owner.account.address));
    });

    it("starts with empty task type list", async function () {
      const { registry } = await loadFixture(deployFixture);
      expect(await registry.read.taskTypeCount()).to.equal(0n);
      expect(await registry.read.getAllTaskTypes()).to.deep.equal([]);
    });

    it("exposes MAX_RESPONSE_TIME_SECONDS = 600", async function () {
      const { registry } = await loadFixture(deployFixture);
      expect(await registry.read.MAX_RESPONSE_TIME_SECONDS()).to.equal(600n);
    });
  });

  describe("registerTaskType", function () {
    it("stores config with enabled=true and registeredAt>0", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([
        TT_A,
        TT_A_NAME,
        TT_A_SCHEMA,
        TT_A_MAX_TIME,
        TT_A_MIN_BUDGET,
      ]);
      const cfg = await registry.read.getConfig([TT_A]);
      expect(cfg.name).to.equal(TT_A_NAME);
      expect(cfg.schemaURI).to.equal(TT_A_SCHEMA);
      expect(cfg.maxResponseTime).to.equal(TT_A_MAX_TIME);
      expect(cfg.minBudget).to.equal(TT_A_MIN_BUDGET);
      expect(cfg.enabled).to.be.true;
      expect(Number(cfg.registeredAt)).to.be.greaterThan(0);
    });

    it("appends to allTaskTypes and increments count", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([
        TT_A,
        TT_A_NAME,
        TT_A_SCHEMA,
        TT_A_MAX_TIME,
        TT_A_MIN_BUDGET,
      ]);
      await registry.write.registerTaskType([
        TT_B,
        "defillama_tvl",
        "ipfs://B",
        20n,
        USDC(2n) / 100n,
      ]);
      expect(await registry.read.taskTypeCount()).to.equal(2n);
      expect(await registry.read.getAllTaskTypes()).to.deep.equal([TT_A, TT_B]);
    });

    it("emits TaskTypeRegistered and TaskTypeEnabledChanged(true)", async function () {
      const { registry, publicClient } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([
        TT_A,
        TT_A_NAME,
        TT_A_SCHEMA,
        TT_A_MAX_TIME,
        TT_A_MIN_BUDGET,
      ]);
      const regLogs = await publicClient.getContractEvents({
        abi: registry.abi,
        address: registry.address,
        eventName: "TaskTypeRegistered",
        fromBlock: 0n,
      });
      expect(regLogs).to.have.lengthOf(1);
      expect(regLogs[0].args.taskType).to.equal(TT_A);
      expect(regLogs[0].args.name).to.equal(TT_A_NAME);

      const enLogs = await publicClient.getContractEvents({
        abi: registry.abi,
        address: registry.address,
        eventName: "TaskTypeEnabledChanged",
        fromBlock: 0n,
      });
      expect(enLogs).to.have.lengthOf(1);
      expect(enLogs[0].args.enabled).to.be.true;
    });

    it("reverts on empty task type id", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(
        registry.write.registerTaskType([
          ZERO_ID,
          TT_A_NAME,
          TT_A_SCHEMA,
          TT_A_MAX_TIME,
          TT_A_MIN_BUDGET,
        ]),
      ).to.be.rejectedWith(/empty task type id/);
    });

    it("reverts on duplicate", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([
        TT_A,
        TT_A_NAME,
        TT_A_SCHEMA,
        TT_A_MAX_TIME,
        TT_A_MIN_BUDGET,
      ]);
      await expect(
        registry.write.registerTaskType([
          TT_A,
          TT_A_NAME,
          TT_A_SCHEMA,
          TT_A_MAX_TIME,
          TT_A_MIN_BUDGET,
        ]),
      ).to.be.rejectedWith(/already registered/);
    });

    it("reverts on empty name", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(
        registry.write.registerTaskType([TT_A, "", TT_A_SCHEMA, TT_A_MAX_TIME, TT_A_MIN_BUDGET]),
      ).to.be.rejectedWith(/empty name/);
    });

    it("reverts on maxResponseTime = 0", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(
        registry.write.registerTaskType([TT_A, TT_A_NAME, TT_A_SCHEMA, 0n, TT_A_MIN_BUDGET]),
      ).to.be.rejectedWith(/invalid response time/);
    });

    it("reverts on maxResponseTime > 600", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(
        registry.write.registerTaskType([TT_A, TT_A_NAME, TT_A_SCHEMA, 601n, TT_A_MIN_BUDGET]),
      ).to.be.rejectedWith(/invalid response time/);
    });

    it("accepts maxResponseTime = 600 (boundary)", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([TT_A, TT_A_NAME, TT_A_SCHEMA, 600n, TT_A_MIN_BUDGET]);
      const cfg = await registry.read.getConfig([TT_A]);
      expect(cfg.maxResponseTime).to.equal(600n);
    });

    it("accepts empty schemaURI (schema set later)", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([TT_A, TT_A_NAME, "", TT_A_MAX_TIME, TT_A_MIN_BUDGET]);
      const cfg = await registry.read.getConfig([TT_A]);
      expect(cfg.schemaURI).to.equal("");
    });

    it("reverts OwnableUnauthorizedAccount for non-owner", async function () {
      const { registry, other } = await loadFixture(deployFixture);
      const asOther = await as(registry, other);
      await expect(
        asOther.write.registerTaskType([
          TT_A,
          TT_A_NAME,
          TT_A_SCHEMA,
          TT_A_MAX_TIME,
          TT_A_MIN_BUDGET,
        ]),
      ).to.be.rejectedWith(/OwnableUnauthorizedAccount/);
    });
  });

  describe("updateConfig", function () {
    it("updates fields and keeps name + enabled + registeredAt", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([
        TT_A,
        TT_A_NAME,
        TT_A_SCHEMA,
        TT_A_MAX_TIME,
        TT_A_MIN_BUDGET,
      ]);
      const before = await registry.read.getConfig([TT_A]);

      await registry.write.updateConfig([TT_A, "ipfs://new", 120n, USDC(1n)]);
      const after = await registry.read.getConfig([TT_A]);

      expect(after.name).to.equal(TT_A_NAME);
      expect(after.schemaURI).to.equal("ipfs://new");
      expect(after.maxResponseTime).to.equal(120n);
      expect(after.minBudget).to.equal(USDC(1n));
      expect(after.enabled).to.be.true;
      expect(after.registeredAt).to.equal(before.registeredAt);
    });

    it("emits TaskTypeUpdated", async function () {
      const { registry, publicClient } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([
        TT_A,
        TT_A_NAME,
        TT_A_SCHEMA,
        TT_A_MAX_TIME,
        TT_A_MIN_BUDGET,
      ]);
      await registry.write.updateConfig([TT_A, "ipfs://x", 120n, USDC(1n)]);
      const logs = await publicClient.getContractEvents({
        abi: registry.abi,
        address: registry.address,
        eventName: "TaskTypeUpdated",
        fromBlock: 0n,
      });
      expect(logs).to.have.lengthOf(1);
      expect(logs[0].args.taskType).to.equal(TT_A);
    });

    it("reverts when task type not registered", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(
        registry.write.updateConfig([TT_UNKNOWN, "ipfs://x", 120n, USDC(1n)]),
      ).to.be.rejectedWith(/not found/);
    });

    it("reverts on invalid maxResponseTime", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([
        TT_A,
        TT_A_NAME,
        TT_A_SCHEMA,
        TT_A_MAX_TIME,
        TT_A_MIN_BUDGET,
      ]);
      await expect(
        registry.write.updateConfig([TT_A, "ipfs://x", 0n, USDC(1n)]),
      ).to.be.rejectedWith(/invalid response time/);
      await expect(
        registry.write.updateConfig([TT_A, "ipfs://x", 601n, USDC(1n)]),
      ).to.be.rejectedWith(/invalid response time/);
    });

    it("reverts OwnableUnauthorizedAccount for non-owner", async function () {
      const { registry, other } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([
        TT_A,
        TT_A_NAME,
        TT_A_SCHEMA,
        TT_A_MAX_TIME,
        TT_A_MIN_BUDGET,
      ]);
      const asOther = await as(registry, other);
      await expect(
        asOther.write.updateConfig([TT_A, "ipfs://x", 120n, USDC(1n)]),
      ).to.be.rejectedWith(/OwnableUnauthorizedAccount/);
    });
  });

  describe("setEnabled", function () {
    it("disables then re-enables with events", async function () {
      const { registry, publicClient } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([
        TT_A,
        TT_A_NAME,
        TT_A_SCHEMA,
        TT_A_MAX_TIME,
        TT_A_MIN_BUDGET,
      ]);

      await registry.write.setEnabled([TT_A, false]);
      expect(await registry.read.isEnabled([TT_A])).to.be.false;

      await registry.write.setEnabled([TT_A, true]);
      expect(await registry.read.isEnabled([TT_A])).to.be.true;

      const logs = await publicClient.getContractEvents({
        abi: registry.abi,
        address: registry.address,
        eventName: "TaskTypeEnabledChanged",
        fromBlock: 0n,
      });
      // register(true) + disable(false) + enable(true) = 3
      expect(logs).to.have.lengthOf(3);
    });

    it("no-op + no event when value unchanged", async function () {
      const { registry, publicClient } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([
        TT_A,
        TT_A_NAME,
        TT_A_SCHEMA,
        TT_A_MAX_TIME,
        TT_A_MIN_BUDGET,
      ]);
      await registry.write.setEnabled([TT_A, true]); // already true
      const logs = await publicClient.getContractEvents({
        abi: registry.abi,
        address: registry.address,
        eventName: "TaskTypeEnabledChanged",
        fromBlock: 0n,
      });
      expect(logs).to.have.lengthOf(1); // only from register
    });

    it("reverts when task type not registered", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(registry.write.setEnabled([TT_UNKNOWN, false])).to.be.rejectedWith(/not found/);
    });

    it("reverts OwnableUnauthorizedAccount for non-owner", async function () {
      const { registry, other } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([
        TT_A,
        TT_A_NAME,
        TT_A_SCHEMA,
        TT_A_MAX_TIME,
        TT_A_MIN_BUDGET,
      ]);
      const asOther = await as(registry, other);
      await expect(asOther.write.setEnabled([TT_A, false])).to.be.rejectedWith(
        /OwnableUnauthorizedAccount/,
      );
    });
  });

  describe("isEnabled / getConfig", function () {
    it("isEnabled returns false for unregistered id (no revert)", async function () {
      const { registry } = await loadFixture(deployFixture);
      expect(await registry.read.isEnabled([TT_UNKNOWN])).to.be.false;
    });

    it("isEnabled respects disabled flag", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.write.registerTaskType([
        TT_A,
        TT_A_NAME,
        TT_A_SCHEMA,
        TT_A_MAX_TIME,
        TT_A_MIN_BUDGET,
      ]);
      await registry.write.setEnabled([TT_A, false]);
      expect(await registry.read.isEnabled([TT_A])).to.be.false;
    });

    it("getConfig reverts for unregistered id", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(registry.read.getConfig([TT_UNKNOWN])).to.be.rejectedWith(/not found/);
    });
  });

  describe("Ownable2Step", function () {
    it("transferOwnership sets pendingOwner but not owner", async function () {
      const { registry, owner, other } = await loadFixture(deployFixture);
      await registry.write.transferOwnership([other.account.address]);
      expect(getAddress(await registry.read.owner())).to.equal(getAddress(owner.account.address));
      expect(getAddress(await registry.read.pendingOwner())).to.equal(
        getAddress(other.account.address),
      );
    });

    it("acceptOwnership completes 2-step transfer", async function () {
      const { registry, other } = await loadFixture(deployFixture);
      await registry.write.transferOwnership([other.account.address]);
      const asOther = await as(registry, other);
      await asOther.write.acceptOwnership();
      expect(getAddress(await registry.read.owner())).to.equal(getAddress(other.account.address));
      expect(await registry.read.pendingOwner()).to.equal(zeroAddress);
    });

    it("only pendingOwner can acceptOwnership", async function () {
      const { registry, other, stranger } = await loadFixture(deployFixture);
      await registry.write.transferOwnership([other.account.address]);
      const asStranger = await as(registry, stranger);
      await expect(asStranger.write.acceptOwnership()).to.be.rejectedWith(
        /OwnableUnauthorizedAccount/,
      );
    });

    it("new owner can register, old owner cannot, after acceptance", async function () {
      const { registry, owner, other } = await loadFixture(deployFixture);
      await registry.write.transferOwnership([other.account.address]);
      const asOther = await as(registry, other);
      await asOther.write.acceptOwnership();

      await asOther.write.registerTaskType([
        TT_A,
        TT_A_NAME,
        TT_A_SCHEMA,
        TT_A_MAX_TIME,
        TT_A_MIN_BUDGET,
      ]);
      expect(await registry.read.isEnabled([TT_A])).to.be.true;

      const asOldOwner = await as(registry, owner);
      await expect(
        asOldOwner.write.registerTaskType([
          TT_B,
          "defillama_tvl",
          "ipfs://B",
          20n,
          USDC(2n) / 100n,
        ]),
      ).to.be.rejectedWith(/OwnableUnauthorizedAccount/);
    });
  });
});
