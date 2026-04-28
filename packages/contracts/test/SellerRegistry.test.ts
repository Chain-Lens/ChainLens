import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { getAddress, keccak256, stringToBytes, zeroAddress } from "viem";

const USDC = (n: bigint) => n * 1_000_000n;

const CAP_A = keccak256(stringToBytes("blockscout_contract_source"));
const CAP_B = keccak256(stringToBytes("defillama_tvl"));
const CAP_C = keccak256(stringToBytes("sourcify_verify"));

const NAME = "alpha-seller";
const METADATA = "ipfs://bafyProfile";

describe("SellerRegistry", function () {
  async function deployFixture() {
    const [owner, gateway, seller, other, stranger] = await hre.viem.getWalletClients();
    const registry = await hre.viem.deployContract("SellerRegistry", [gateway.account.address]);
    const publicClient = await hre.viem.getPublicClient();
    return { registry, owner, gateway, seller, other, stranger, publicClient };
  }

  async function as(registry: any, wallet: any) {
    return hre.viem.getContractAt("SellerRegistry", registry.address, {
      client: { wallet },
    });
  }

  describe("Deployment", function () {
    it("sets deployer as owner", async function () {
      const { registry, owner } = await loadFixture(deployFixture);
      expect(getAddress(await registry.read.owner())).to.equal(getAddress(owner.account.address));
    });

    it("sets initial gateway", async function () {
      const { registry, gateway } = await loadFixture(deployFixture);
      expect(getAddress(await registry.read.gateway())).to.equal(
        getAddress(gateway.account.address),
      );
    });

    it("exposes reputation constants", async function () {
      const { registry } = await loadFixture(deployFixture);
      expect(await registry.read.REPUTATION_NEUTRAL_BPS()).to.equal(5_000n);
      expect(await registry.read.REPUTATION_MAX_BPS()).to.equal(10_000n);
    });

    it("emits GatewayUpdated(0, gateway) on deploy", async function () {
      const { registry, gateway, publicClient } = await loadFixture(deployFixture);
      const logs = await publicClient.getContractEvents({
        abi: registry.abi,
        address: registry.address,
        eventName: "GatewayUpdated",
        fromBlock: 0n,
      });
      expect(logs).to.have.lengthOf(1);
      expect(logs[0].args.previousGateway).to.equal(zeroAddress);
      expect(getAddress(logs[0].args.newGateway as `0x${string}`)).to.equal(
        getAddress(gateway.account.address),
      );
    });

    it("reverts on zero gateway", async function () {
      await expect(hre.viem.deployContract("SellerRegistry", [zeroAddress])).to.be.rejectedWith(
        /zero gateway/,
      );
    });
  });

  describe("setGateway", function () {
    it("owner can rotate gateway and emits GatewayUpdated", async function () {
      const { registry, gateway, other, publicClient } = await loadFixture(deployFixture);
      await registry.write.setGateway([other.account.address]);
      expect(getAddress(await registry.read.gateway())).to.equal(getAddress(other.account.address));
      const logs = await publicClient.getContractEvents({
        abi: registry.abi,
        address: registry.address,
        eventName: "GatewayUpdated",
        fromBlock: 0n,
      });
      // deploy + rotate = 2
      expect(logs).to.have.lengthOf(2);
      expect(getAddress(logs[1].args.previousGateway as `0x${string}`)).to.equal(
        getAddress(gateway.account.address),
      );
      expect(getAddress(logs[1].args.newGateway as `0x${string}`)).to.equal(
        getAddress(other.account.address),
      );
    });

    it("reverts on zero gateway", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(registry.write.setGateway([zeroAddress])).to.be.rejectedWith(/zero gateway/);
    });

    it("reverts OwnableUnauthorizedAccount for non-owner", async function () {
      const { registry, other } = await loadFixture(deployFixture);
      const asOther = await as(registry, other);
      await expect(asOther.write.setGateway([other.account.address])).to.be.rejectedWith(
        /OwnableUnauthorizedAccount/,
      );
    });
  });

  describe("registerSeller", function () {
    it("stores seller and indexes capabilities", async function () {
      const { registry, gateway, seller } = await loadFixture(deployFixture);
      const asGateway = await as(registry, gateway);
      await asGateway.write.registerSeller([
        seller.account.address,
        NAME,
        [CAP_A, CAP_B],
        METADATA,
      ]);
      const s = await registry.read.getSellerInfo([seller.account.address]);
      expect(getAddress(s.sellerAddress)).to.equal(getAddress(seller.account.address));
      expect(s.name).to.equal(NAME);
      expect(s.capabilities).to.deep.equal([CAP_A, CAP_B]);
      expect(s.metadataURI).to.equal(METADATA);
      expect(s.active).to.be.true;
      expect(Number(s.registeredAt)).to.be.greaterThan(0);

      expect((await registry.read.getSellersByCapability([CAP_A])).map(getAddress)).to.deep.equal([
        getAddress(seller.account.address),
      ]);
      expect((await registry.read.getSellersByCapability([CAP_B])).map(getAddress)).to.deep.equal([
        getAddress(seller.account.address),
      ]);
      expect(await registry.read.isRegistered([seller.account.address])).to.be.true;
      expect(await registry.read.isActive([seller.account.address])).to.be.true;
    });

    it("emits SellerRegistered", async function () {
      const { registry, gateway, seller, publicClient } = await loadFixture(deployFixture);
      const asGateway = await as(registry, gateway);
      await asGateway.write.registerSeller([seller.account.address, NAME, [CAP_A], METADATA]);
      const logs = await publicClient.getContractEvents({
        abi: registry.abi,
        address: registry.address,
        eventName: "SellerRegistered",
        fromBlock: 0n,
      });
      expect(logs).to.have.lengthOf(1);
      expect(getAddress(logs[0].args.seller as `0x${string}`)).to.equal(
        getAddress(seller.account.address),
      );
      expect(logs[0].args.name).to.equal(NAME);
      expect(logs[0].args.capabilities).to.deep.equal([CAP_A]);
    });

    it("reverts for non-gateway caller", async function () {
      const { registry, owner, seller } = await loadFixture(deployFixture);
      const asOwner = await as(registry, owner);
      await expect(
        asOwner.write.registerSeller([seller.account.address, NAME, [CAP_A], METADATA]),
      ).to.be.rejectedWith(/only gateway/);
    });

    it("reverts on zero seller", async function () {
      const { registry, gateway } = await loadFixture(deployFixture);
      const asGateway = await as(registry, gateway);
      await expect(
        asGateway.write.registerSeller([zeroAddress, NAME, [CAP_A], METADATA]),
      ).to.be.rejectedWith(/zero seller/);
    });

    it("reverts on duplicate seller", async function () {
      const { registry, gateway, seller } = await loadFixture(deployFixture);
      const asGateway = await as(registry, gateway);
      await asGateway.write.registerSeller([seller.account.address, NAME, [CAP_A], METADATA]);
      await expect(
        asGateway.write.registerSeller([seller.account.address, NAME, [CAP_A], METADATA]),
      ).to.be.rejectedWith(/already registered/);
    });

    it("reverts on address reuse after deactivation", async function () {
      const { registry, gateway, seller } = await loadFixture(deployFixture);
      const asGateway = await as(registry, gateway);
      await asGateway.write.registerSeller([seller.account.address, NAME, [CAP_A], METADATA]);
      await asGateway.write.deactivate([seller.account.address]);
      await expect(
        asGateway.write.registerSeller([seller.account.address, NAME, [CAP_A], METADATA]),
      ).to.be.rejectedWith(/address reused/);
    });

    it("reverts on empty name", async function () {
      const { registry, gateway, seller } = await loadFixture(deployFixture);
      const asGateway = await as(registry, gateway);
      await expect(
        asGateway.write.registerSeller([seller.account.address, "", [CAP_A], METADATA]),
      ).to.be.rejectedWith(/empty name/);
    });

    it("reverts on empty capabilities array", async function () {
      const { registry, gateway, seller } = await loadFixture(deployFixture);
      const asGateway = await as(registry, gateway);
      await expect(
        asGateway.write.registerSeller([seller.account.address, NAME, [], METADATA]),
      ).to.be.rejectedWith(/no capabilities/);
    });

    it("indexes two sellers under the same capability", async function () {
      const { registry, gateway, seller, other } = await loadFixture(deployFixture);
      const asGateway = await as(registry, gateway);
      await asGateway.write.registerSeller([seller.account.address, NAME, [CAP_A], METADATA]);
      await asGateway.write.registerSeller([other.account.address, "beta", [CAP_A], METADATA]);
      const list = (await registry.read.getSellersByCapability([CAP_A])).map((a: string) =>
        a.toLowerCase(),
      );
      expect(list).to.deep.equal([
        seller.account.address.toLowerCase(),
        other.account.address.toLowerCase(),
      ]);
    });
  });

  describe("updateMetadataURI", function () {
    it("updates URI and emits SellerUpdated", async function () {
      const { registry, gateway, seller, publicClient } = await loadFixture(deployFixture);
      const asGateway = await as(registry, gateway);
      await asGateway.write.registerSeller([seller.account.address, NAME, [CAP_A], METADATA]);
      await asGateway.write.updateMetadataURI([seller.account.address, "ipfs://new"]);
      const s = await registry.read.getSellerInfo([seller.account.address]);
      expect(s.metadataURI).to.equal("ipfs://new");

      const logs = await publicClient.getContractEvents({
        abi: registry.abi,
        address: registry.address,
        eventName: "SellerUpdated",
        fromBlock: 0n,
      });
      expect(logs).to.have.lengthOf(1);
      expect(logs[0].args.metadataURI).to.equal("ipfs://new");
    });

    it("reverts when seller not registered", async function () {
      const { registry, gateway, seller } = await loadFixture(deployFixture);
      const asGateway = await as(registry, gateway);
      await expect(
        asGateway.write.updateMetadataURI([seller.account.address, "ipfs://x"]),
      ).to.be.rejectedWith(/not found/);
    });

    it("reverts for non-gateway caller", async function () {
      const { registry, owner, seller } = await loadFixture(deployFixture);
      const asOwner = await as(registry, owner);
      await expect(
        asOwner.write.updateMetadataURI([seller.account.address, "ipfs://x"]),
      ).to.be.rejectedWith(/only gateway/);
    });
  });

  describe("deactivate", function () {
    async function registered() {
      const fx = await loadFixture(deployFixture);
      const asGateway = await as(fx.registry, fx.gateway);
      await asGateway.write.registerSeller([fx.seller.account.address, NAME, [CAP_A], METADATA]);
      return fx;
    }

    it("seller can deactivate self", async function () {
      const fx = await registered();
      const asSeller = await as(fx.registry, fx.seller);
      await asSeller.write.deactivate([fx.seller.account.address]);
      expect(await fx.registry.read.isActive([fx.seller.account.address])).to.be.false;
    });

    it("gateway can deactivate seller", async function () {
      const fx = await registered();
      const asGateway = await as(fx.registry, fx.gateway);
      await asGateway.write.deactivate([fx.seller.account.address]);
      expect(await fx.registry.read.isActive([fx.seller.account.address])).to.be.false;
    });

    it("owner can deactivate seller", async function () {
      const fx = await registered();
      await fx.registry.write.deactivate([fx.seller.account.address]);
      expect(await fx.registry.read.isActive([fx.seller.account.address])).to.be.false;
    });

    it("emits SellerDeactivated", async function () {
      const fx = await registered();
      const asGateway = await as(fx.registry, fx.gateway);
      await asGateway.write.deactivate([fx.seller.account.address]);
      const logs = await fx.publicClient.getContractEvents({
        abi: fx.registry.abi,
        address: fx.registry.address,
        eventName: "SellerDeactivated",
        fromBlock: 0n,
      });
      expect(logs).to.have.lengthOf(1);
      expect(getAddress(logs[0].args.seller as `0x${string}`)).to.equal(
        getAddress(fx.seller.account.address),
      );
    });

    it("unauthorized caller reverts", async function () {
      const fx = await registered();
      const asStranger = await as(fx.registry, fx.stranger);
      await expect(asStranger.write.deactivate([fx.seller.account.address])).to.be.rejectedWith(
        /unauthorized/,
      );
    });

    it("reverts when seller not registered", async function () {
      const { registry, gateway, other } = await loadFixture(deployFixture);
      const asGateway = await as(registry, gateway);
      await expect(asGateway.write.deactivate([other.account.address])).to.be.rejectedWith(
        /not found/,
      );
    });

    it("reverts when already inactive", async function () {
      const fx = await registered();
      const asGateway = await as(fx.registry, fx.gateway);
      await asGateway.write.deactivate([fx.seller.account.address]);
      await expect(asGateway.write.deactivate([fx.seller.account.address])).to.be.rejectedWith(
        /already inactive/,
      );
    });
  });

  describe("recordJobResult / getReputation", function () {
    async function registered() {
      const fx = await loadFixture(deployFixture);
      const asGateway = await as(fx.registry, fx.gateway);
      await asGateway.write.registerSeller([fx.seller.account.address, NAME, [CAP_A], METADATA]);
      return { ...fx, asGateway };
    }

    it("returns neutral 5000 bps when no jobs recorded", async function () {
      const fx = await registered();
      expect(await fx.registry.read.getReputation([fx.seller.account.address])).to.equal(5_000n);
    });

    it("success path increments completed + earnings and emits event", async function () {
      const fx = await registered();
      await fx.asGateway.write.recordJobResult([fx.seller.account.address, true, USDC(3n)]);
      expect(await fx.registry.read.jobsCompleted([fx.seller.account.address])).to.equal(1n);
      expect(await fx.registry.read.jobsFailed([fx.seller.account.address])).to.equal(0n);
      expect(await fx.registry.read.totalEarnings([fx.seller.account.address])).to.equal(USDC(3n));

      const logs = await fx.publicClient.getContractEvents({
        abi: fx.registry.abi,
        address: fx.registry.address,
        eventName: "JobResultRecorded",
        fromBlock: 0n,
      });
      expect(logs).to.have.lengthOf(1);
      expect(logs[0].args.success).to.be.true;
      expect(logs[0].args.amount).to.equal(USDC(3n));
    });

    it("failure path increments failed only", async function () {
      const fx = await registered();
      await fx.asGateway.write.recordJobResult([fx.seller.account.address, false, USDC(2n)]);
      expect(await fx.registry.read.jobsCompleted([fx.seller.account.address])).to.equal(0n);
      expect(await fx.registry.read.jobsFailed([fx.seller.account.address])).to.equal(1n);
      expect(await fx.registry.read.totalEarnings([fx.seller.account.address])).to.equal(0n);
    });

    it("10000 bps for all-pass", async function () {
      const fx = await registered();
      for (let i = 0; i < 3; i++) {
        await fx.asGateway.write.recordJobResult([fx.seller.account.address, true, USDC(1n)]);
      }
      expect(await fx.registry.read.getReputation([fx.seller.account.address])).to.equal(10_000n);
    });

    it("0 bps for all-fail", async function () {
      const fx = await registered();
      for (let i = 0; i < 2; i++) {
        await fx.asGateway.write.recordJobResult([fx.seller.account.address, false, 0n]);
      }
      expect(await fx.registry.read.getReputation([fx.seller.account.address])).to.equal(0n);
    });

    it("5000 bps for even mix", async function () {
      const fx = await registered();
      await fx.asGateway.write.recordJobResult([fx.seller.account.address, true, USDC(1n)]);
      await fx.asGateway.write.recordJobResult([fx.seller.account.address, false, 0n]);
      expect(await fx.registry.read.getReputation([fx.seller.account.address])).to.equal(5_000n);
    });

    it("reverts when seller not registered", async function () {
      const { registry, gateway, other } = await loadFixture(deployFixture);
      const asGateway = await as(registry, gateway);
      await expect(
        asGateway.write.recordJobResult([other.account.address, true, 0n]),
      ).to.be.rejectedWith(/not found/);
    });

    it("reverts for non-gateway caller", async function () {
      const fx = await registered();
      const asOwner = await as(fx.registry, fx.owner);
      await expect(
        asOwner.write.recordJobResult([fx.seller.account.address, true, USDC(1n)]),
      ).to.be.rejectedWith(/only gateway/);
    });
  });

  describe("view helpers", function () {
    it("getSellerInfo reverts for unknown seller", async function () {
      const { registry, other } = await loadFixture(deployFixture);
      await expect(registry.read.getSellerInfo([other.account.address])).to.be.rejectedWith(
        /not found/,
      );
    });

    it("getSellersByCapability returns empty for unseen capability", async function () {
      const { registry } = await loadFixture(deployFixture);
      expect(await registry.read.getSellersByCapability([CAP_C])).to.deep.equal([]);
    });

    it("isRegistered/isActive false for unknown", async function () {
      const { registry, other } = await loadFixture(deployFixture);
      expect(await registry.read.isRegistered([other.account.address])).to.be.false;
      expect(await registry.read.isActive([other.account.address])).to.be.false;
    });
  });

  describe("Ownable2Step", function () {
    it("transferOwnership is 2-step", async function () {
      const { registry, owner, other } = await loadFixture(deployFixture);
      await registry.write.transferOwnership([other.account.address]);
      expect(getAddress(await registry.read.owner())).to.equal(getAddress(owner.account.address));
      const asOther = await as(registry, other);
      await asOther.write.acceptOwnership();
      expect(getAddress(await registry.read.owner())).to.equal(getAddress(other.account.address));
    });

    it("new owner can rotate gateway; old owner cannot", async function () {
      const { registry, owner, other, stranger } = await loadFixture(deployFixture);
      await registry.write.transferOwnership([other.account.address]);
      const asOther = await as(registry, other);
      await asOther.write.acceptOwnership();

      await asOther.write.setGateway([stranger.account.address]);
      expect(getAddress(await registry.read.gateway())).to.equal(
        getAddress(stranger.account.address),
      );

      const asOldOwner = await as(registry, owner);
      await expect(asOldOwner.write.setGateway([owner.account.address])).to.be.rejectedWith(
        /OwnableUnauthorizedAccount/,
      );
    });
  });
});
