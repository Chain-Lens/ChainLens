import { expect } from "chai";
import hre from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import {
  getAddress,
  keccak256,
  stringToBytes,
  zeroAddress,
  zeroHash,
} from "viem";

const USDC = (n: bigint) => n * 1_000_000n;
const BURN = "0x000000000000000000000000000000000000dEaD";
const JOB_REF = keccak256(stringToBytes("job_1"));
const NONCE_1 = keccak256(stringToBytes("n1"));
const NONCE_2 = keccak256(stringToBytes("n2"));

describe("ChainLensMarket", function () {
  async function deployFixture() {
    const [owner, gateway, seller, buyer, treasury, other] =
      await hre.viem.getWalletClients();
    const usdc = await hre.viem.deployContract("MockUSDC");
    const market = await hre.viem.deployContract("ChainLensMarket", [
      gateway.account.address,
      treasury.account.address,
      usdc.address,
    ]);
    const publicClient = await hre.viem.getPublicClient();

    await usdc.write.mint([seller.account.address, USDC(100n)]);
    await usdc.write.mint([buyer.account.address, USDC(100n)]);

    return {
      market,
      usdc,
      owner,
      gateway,
      seller,
      buyer,
      treasury,
      other,
      publicClient,
    };
  }

  async function asWallet(contract: any, wallet: any, name = "ChainLensMarket") {
    return hre.viem.getContractAt(name, contract.address, {
      client: { wallet },
    });
  }

  describe("Deployment", function () {
    it("sets owner, initial gateway, treasury, usdc", async function () {
      const { market, owner, gateway, treasury, usdc } =
        await loadFixture(deployFixture);
      expect(getAddress(await market.read.owner())).to.equal(
        getAddress(owner.account.address),
      );
      expect(
        await market.read.isGateway([gateway.account.address]),
      ).to.equal(true);
      expect(getAddress(await market.read.treasury())).to.equal(
        getAddress(treasury.account.address),
      );
      expect(getAddress(await market.read.usdc())).to.equal(
        getAddress(usdc.address),
      );
    });

    it("registrationFeeToken defaults to USDC", async function () {
      const { market, usdc } = await loadFixture(deployFixture);
      expect(
        getAddress(await market.read.registrationFeeToken()),
      ).to.equal(getAddress(usdc.address));
    });

    it("all fees default to 0 (zero onboarding friction)", async function () {
      const { market } = await loadFixture(deployFixture);
      expect(await market.read.registrationFee()).to.equal(0n);
      expect(await market.read.registrationBurnBps()).to.equal(0);
      expect(await market.read.serviceFeeBps()).to.equal(0);
      expect(await market.read.maxListingsPerAccount()).to.equal(0);
    });

    it("reverts on zero address in constructor", async function () {
      const [_, gateway, , , treasury] = await hre.viem.getWalletClients();
      const usdc = await hre.viem.deployContract("MockUSDC");
      await expect(
        hre.viem.deployContract("ChainLensMarket", [
          zeroAddress,
          treasury.account.address,
          usdc.address,
        ]),
      ).to.be.rejectedWith("zero gateway");
      await expect(
        hre.viem.deployContract("ChainLensMarket", [
          gateway.account.address,
          zeroAddress,
          usdc.address,
        ]),
      ).to.be.rejectedWith("zero treasury");
      await expect(
        hre.viem.deployContract("ChainLensMarket", [
          gateway.account.address,
          treasury.account.address,
          zeroAddress,
        ]),
      ).to.be.rejectedWith("zero usdc");
    });
  });

  describe("Registration (fee == 0, early-stage default)", function () {
    it("anyone can register without payment", async function () {
      const { market, seller } = await loadFixture(deployFixture);
      const m = await asWallet(market, seller);
      await m.write.register([seller.account.address, "ipfs://meta"]);

      const listing = await market.read.getListing([0n]);
      expect(getAddress(listing.owner)).to.equal(
        getAddress(seller.account.address),
      );
      expect(getAddress(listing.payout)).to.equal(
        getAddress(seller.account.address),
      );
      expect(listing.metadataURI).to.equal("ipfs://meta");
      expect(listing.active).to.equal(true);
    });

    it("increments listingId and per-account count", async function () {
      const { market, seller } = await loadFixture(deployFixture);
      const m = await asWallet(market, seller);
      await m.write.register([seller.account.address, "ipfs://1"]);
      await m.write.register([seller.account.address, "ipfs://2"]);
      expect(await market.read.nextListingId()).to.equal(2n);
      expect(
        await market.read.listingsOwnedCount([seller.account.address]),
      ).to.equal(2n);
    });

    it("reverts on zero payout", async function () {
      const { market, seller } = await loadFixture(deployFixture);
      const m = await asWallet(market, seller);
      await expect(
        m.write.register([zeroAddress, "ipfs://x"]),
      ).to.be.rejectedWith("zero payout");
    });

    it("emits ListingRegistered with feePaid=0", async function () {
      const { market, seller, publicClient } =
        await loadFixture(deployFixture);
      const m = await asWallet(market, seller);
      await m.write.register([seller.account.address, "ipfs://ev"]);
      const logs = await publicClient.getContractEvents({
        abi: market.abi,
        address: market.address,
        eventName: "ListingRegistered",
        fromBlock: 0n,
      });
      expect(logs).to.have.lengthOf(1);
      expect(logs[0].args.feePaid).to.equal(0n);
    });
  });

  describe("Registration (fee > 0, anti-spam mode)", function () {
    it("charges fee split between burn and treasury", async function () {
      const { market, usdc, owner, seller, treasury } =
        await loadFixture(deployFixture);
      const mO = await asWallet(market, owner);
      await mO.write.setRegistrationFee([USDC(10n)]);
      await mO.write.setRegistrationBurnBps([5000]); // 50/50 split

      const u = await asWallet(usdc, seller, "MockUSDC");
      await u.write.approve([market.address, USDC(10n)]);

      const mS = await asWallet(market, seller);
      await mS.write.register([seller.account.address, "ipfs://paid"]);

      expect(await usdc.read.balanceOf([BURN])).to.equal(USDC(5n));
      expect(
        await usdc.read.balanceOf([treasury.account.address]),
      ).to.equal(USDC(5n));
      expect(
        await usdc.read.balanceOf([seller.account.address]),
      ).to.equal(USDC(90n));
    });

    it("full burn when registrationBurnBps == 10_000", async function () {
      const { market, usdc, owner, seller, treasury } =
        await loadFixture(deployFixture);
      const mO = await asWallet(market, owner);
      await mO.write.setRegistrationFee([USDC(10n)]);
      await mO.write.setRegistrationBurnBps([10_000]);

      const u = await asWallet(usdc, seller, "MockUSDC");
      await u.write.approve([market.address, USDC(10n)]);
      const mS = await asWallet(market, seller);
      await mS.write.register([seller.account.address, "ipfs://burn"]);

      expect(await usdc.read.balanceOf([BURN])).to.equal(USDC(10n));
      expect(
        await usdc.read.balanceOf([treasury.account.address]),
      ).to.equal(0n);
    });

    it("reverts without USDC approval", async function () {
      const { market, owner, seller } = await loadFixture(deployFixture);
      const mO = await asWallet(market, owner);
      await mO.write.setRegistrationFee([USDC(10n)]);

      const mS = await asWallet(market, seller);
      await expect(
        mS.write.register([seller.account.address, "ipfs://x"]),
      ).to.be.rejected;
    });
  });

  describe("Registration fee token switch", function () {
    it("owner can switch registrationFeeToken to another ERC-20", async function () {
      const { market, owner } = await loadFixture(deployFixture);
      const altToken = await hre.viem.deployContract("MockUSDC");
      const m = await asWallet(market, owner);
      await m.write.setRegistrationFeeToken([altToken.address]);
      expect(
        getAddress(await market.read.registrationFeeToken()),
      ).to.equal(getAddress(altToken.address));
    });

    it("fee is charged in the new token after switch", async function () {
      const { market, owner, seller, treasury, usdc } =
        await loadFixture(deployFixture);
      const altToken = await hre.viem.deployContract("MockUSDC");
      await altToken.write.mint([seller.account.address, USDC(100n)]);

      const mO = await asWallet(market, owner);
      await mO.write.setRegistrationFeeToken([altToken.address]);
      await mO.write.setRegistrationFee([USDC(10n)]);
      await mO.write.setRegistrationBurnBps([5000]);

      const altAsSeller = await asWallet(altToken, seller, "MockUSDC");
      await altAsSeller.write.approve([market.address, USDC(10n)]);

      const mS = await asWallet(market, seller);
      await mS.write.register([seller.account.address, "ipfs://alt"]);

      // alt token moved
      expect(await altToken.read.balanceOf([BURN])).to.equal(USDC(5n));
      expect(
        await altToken.read.balanceOf([treasury.account.address]),
      ).to.equal(USDC(5n));
      // USDC untouched
      expect(
        await usdc.read.balanceOf([seller.account.address]),
      ).to.equal(USDC(100n));
    });

    it("reverts on zero token", async function () {
      const { market, owner } = await loadFixture(deployFixture);
      const m = await asWallet(market, owner);
      await expect(
        m.write.setRegistrationFeeToken([zeroAddress]),
      ).to.be.rejectedWith("zero token");
    });

    it("emits RegistrationFeeTokenUpdated (constructor + switch)", async function () {
      const { market, owner, usdc, publicClient } =
        await loadFixture(deployFixture);
      const altToken = await hre.viem.deployContract("MockUSDC");
      const m = await asWallet(market, owner);
      await m.write.setRegistrationFeeToken([altToken.address]);

      const logs = await publicClient.getContractEvents({
        abi: market.abi,
        address: market.address,
        eventName: "RegistrationFeeTokenUpdated",
        fromBlock: 0n,
      });
      // one from constructor (prev=0, next=USDC), one from switch (prev=USDC, next=alt)
      expect(logs).to.have.lengthOf(2);
      expect(getAddress(logs[0].args.next as `0x${string}`)).to.equal(
        getAddress(usdc.address),
      );
      expect(getAddress(logs[1].args.prev as `0x${string}`)).to.equal(
        getAddress(usdc.address),
      );
      expect(getAddress(logs[1].args.next as `0x${string}`)).to.equal(
        getAddress(altToken.address),
      );
    });
  });

  describe("Listing mutation", function () {
    async function registered() {
      const fix = await loadFixture(deployFixture);
      const mS = await asWallet(fix.market, fix.seller);
      await mS.write.register([fix.seller.account.address, "ipfs://v1"]);
      return { ...fix, mS, listingId: 0n };
    }

    it("owner updates metadata", async function () {
      const { mS, listingId, market } = await registered();
      await mS.write.updateMetadata([listingId, "ipfs://v2"]);
      expect(
        (await market.read.getListing([listingId])).metadataURI,
      ).to.equal("ipfs://v2");
    });

    it("non-owner cannot update metadata", async function () {
      const { market, other, listingId } = await registered();
      const m = await asWallet(market, other);
      await expect(
        m.write.updateMetadata([listingId, "ipfs://evil"]),
      ).to.be.rejectedWith("not owner");
    });

    it("owner updates payout", async function () {
      const { mS, listingId, market, other } = await registered();
      await mS.write.updatePayout([listingId, other.account.address]);
      expect(
        getAddress((await market.read.getListing([listingId])).payout),
      ).to.equal(getAddress(other.account.address));
    });

    it("owner deactivates and reactivates", async function () {
      const { mS, listingId, market } = await registered();
      await mS.write.deactivate([listingId]);
      expect((await market.read.getListing([listingId])).active).to.equal(
        false,
      );
      await mS.write.reactivate([listingId]);
      expect((await market.read.getListing([listingId])).active).to.equal(
        true,
      );
    });

    it("admin can force-deactivate", async function () {
      const { market, owner, listingId } = await registered();
      const m = await asWallet(market, owner);
      await m.write.deactivate([listingId]);
      expect((await market.read.getListing([listingId])).active).to.equal(
        false,
      );
    });

    it("unrelated account cannot deactivate", async function () {
      const { market, other, listingId } = await registered();
      const m = await asWallet(market, other);
      await expect(m.write.deactivate([listingId])).to.be.rejectedWith(
        "not authorized",
      );
    });
  });

  describe("Settlement (happy path)", function () {
    async function setupSettle() {
      const fix = await loadFixture(deployFixture);
      const mS = await asWallet(fix.market, fix.seller);
      await mS.write.register([fix.seller.account.address, "ipfs://m"]);
      // Advance past default validAfter=0 to satisfy MockUSDC's
      // `block.timestamp > validAfter` check.
      await time.increase(1);
      return { ...fix, listingId: 0n };
    }

    it("pulls USDC, credits seller and treasury", async function () {
      const { market, gateway, buyer, seller, treasury, owner, listingId } =
        await setupSettle();
      const mO = await asWallet(market, owner);
      await mO.write.setServiceFeeBps([500]); // 5%

      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const mG = await asWallet(market, gateway);
      await mG.write.settle([
        listingId,
        JOB_REF,
        buyer.account.address,
        USDC(10n),
        0n,
        validBefore,
        NONCE_1,
        27,
        zeroHash,
        zeroHash,
      ]);

      expect(
        await market.read.claimable([seller.account.address]),
      ).to.equal(USDC(10n) - (USDC(10n) * 500n) / 10_000n);
      expect(
        await market.read.claimable([treasury.account.address]),
      ).to.equal((USDC(10n) * 500n) / 10_000n);
    });

    it("credits full amount to seller when serviceFeeBps == 0", async function () {
      const { market, gateway, buyer, seller, treasury, listingId } =
        await setupSettle();
      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const mG = await asWallet(market, gateway);
      await mG.write.settle([
        listingId,
        JOB_REF,
        buyer.account.address,
        USDC(10n),
        0n,
        validBefore,
        NONCE_1,
        27,
        zeroHash,
        zeroHash,
      ]);

      expect(
        await market.read.claimable([seller.account.address]),
      ).to.equal(USDC(10n));
      expect(
        await market.read.claimable([treasury.account.address]),
      ).to.equal(0n);
    });

    it("pays the listing's payout address, not the owner", async function () {
      const { market, gateway, buyer, seller, other, listingId } =
        await setupSettle();
      const mS = await asWallet(market, seller);
      await mS.write.updatePayout([listingId, other.account.address]);

      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const mG = await asWallet(market, gateway);
      await mG.write.settle([
        listingId,
        JOB_REF,
        buyer.account.address,
        USDC(5n),
        0n,
        validBefore,
        NONCE_1,
        27,
        zeroHash,
        zeroHash,
      ]);

      expect(
        await market.read.claimable([other.account.address]),
      ).to.equal(USDC(5n));
      expect(
        await market.read.claimable([seller.account.address]),
      ).to.equal(0n);
    });
  });

  describe("Settlement (revert cases)", function () {
    it("reverts when not gateway", async function () {
      const { market, other, buyer } = await loadFixture(deployFixture);
      const m = await asWallet(market, other);
      await expect(
        m.write.settle([
          0n,
          JOB_REF,
          buyer.account.address,
          USDC(1n),
          0n,
          0n,
          NONCE_1,
          27,
          zeroHash,
          zeroHash,
        ]),
      ).to.be.rejectedWith("only gateway");
    });

    it("reverts on amount zero", async function () {
      const { market, gateway, buyer } = await loadFixture(deployFixture);
      const m = await asWallet(market, gateway);
      await expect(
        m.write.settle([
          0n,
          JOB_REF,
          buyer.account.address,
          0n,
          0n,
          0n,
          NONCE_1,
          27,
          zeroHash,
          zeroHash,
        ]),
      ).to.be.rejectedWith("amount zero");
    });

    it("reverts on unknown listing", async function () {
      const { market, gateway, buyer } = await loadFixture(deployFixture);
      const m = await asWallet(market, gateway);
      await expect(
        m.write.settle([
          999n,
          JOB_REF,
          buyer.account.address,
          USDC(1n),
          0n,
          0n,
          NONCE_1,
          27,
          zeroHash,
          zeroHash,
        ]),
      ).to.be.rejectedWith("listing not found");
    });

    it("reverts on inactive listing", async function () {
      const { market, seller, gateway, buyer } =
        await loadFixture(deployFixture);
      const mS = await asWallet(market, seller);
      await mS.write.register([seller.account.address, "ipfs://m"]);
      await mS.write.deactivate([0n]);
      const m = await asWallet(market, gateway);
      await expect(
        m.write.settle([
          0n,
          JOB_REF,
          buyer.account.address,
          USDC(1n),
          0n,
          0n,
          NONCE_1,
          27,
          zeroHash,
          zeroHash,
        ]),
      ).to.be.rejectedWith("listing inactive");
    });
  });

  describe("Gateway whitelist (multi-gateway support)", function () {
    it("owner can whitelist an additional gateway", async function () {
      const { market, owner, other } = await loadFixture(deployFixture);
      const m = await asWallet(market, owner);
      await m.write.setGateway([other.account.address, true]);
      expect(
        await market.read.isGateway([other.account.address]),
      ).to.equal(true);
    });

    it("owner can delist a gateway", async function () {
      const { market, owner, gateway } = await loadFixture(deployFixture);
      const m = await asWallet(market, owner);
      await m.write.setGateway([gateway.account.address, false]);
      expect(
        await market.read.isGateway([gateway.account.address]),
      ).to.equal(false);
    });

    it("delisted gateway can no longer settle", async function () {
      const { market, owner, gateway, seller, buyer } =
        await loadFixture(deployFixture);
      const mS = await asWallet(market, seller);
      await mS.write.register([seller.account.address, "ipfs://m"]);
      await time.increase(1);

      const mO = await asWallet(market, owner);
      await mO.write.setGateway([gateway.account.address, false]);

      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const mG = await asWallet(market, gateway);
      await expect(
        mG.write.settle([
          0n,
          JOB_REF,
          buyer.account.address,
          USDC(1n),
          0n,
          validBefore,
          NONCE_1,
          27,
          zeroHash,
          zeroHash,
        ]),
      ).to.be.rejectedWith("only gateway");
    });

    it("second whitelisted gateway can settle independently", async function () {
      const { market, owner, other, seller, buyer } =
        await loadFixture(deployFixture);
      const mS = await asWallet(market, seller);
      await mS.write.register([seller.account.address, "ipfs://m"]);
      await time.increase(1);

      const mO = await asWallet(market, owner);
      await mO.write.setGateway([other.account.address, true]);

      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const mOther = await asWallet(market, other);
      await mOther.write.settle([
        0n,
        JOB_REF,
        buyer.account.address,
        USDC(3n),
        0n,
        validBefore,
        NONCE_1,
        27,
        zeroHash,
        zeroHash,
      ]);

      expect(
        await market.read.claimable([seller.account.address]),
      ).to.equal(USDC(3n));
    });

    it("reverts on zero gateway address", async function () {
      const { market, owner } = await loadFixture(deployFixture);
      const m = await asWallet(market, owner);
      await expect(
        m.write.setGateway([zeroAddress, true]),
      ).to.be.rejectedWith("zero gateway");
    });

    it("emits GatewaySet on whitelist and delist", async function () {
      const { market, owner, other, publicClient } =
        await loadFixture(deployFixture);
      const m = await asWallet(market, owner);
      await m.write.setGateway([other.account.address, true]);
      await m.write.setGateway([other.account.address, false]);
      const logs = await publicClient.getContractEvents({
        abi: market.abi,
        address: market.address,
        eventName: "GatewaySet",
        fromBlock: 0n,
      });
      // one from constructor (gateway=deployed, true), two from setGateway calls
      expect(logs).to.have.lengthOf(3);
      expect(logs[1].args.isGateway).to.equal(true);
      expect(logs[2].args.isGateway).to.equal(false);
    });
  });

  describe("Claim", function () {
    it("pays out full claimable balance and zeros storage", async function () {
      const { market, usdc, gateway, buyer, seller } =
        await loadFixture(deployFixture);
      const mS = await asWallet(market, seller);
      await mS.write.register([seller.account.address, "ipfs://m"]);
      await time.increase(1);

      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const mG = await asWallet(market, gateway);
      await mG.write.settle([
        0n,
        JOB_REF,
        buyer.account.address,
        USDC(7n),
        0n,
        validBefore,
        NONCE_1,
        27,
        zeroHash,
        zeroHash,
      ]);

      const balBefore = await usdc.read.balanceOf([seller.account.address]);
      await mS.write.claim();
      const balAfter = await usdc.read.balanceOf([seller.account.address]);

      expect(balAfter - balBefore).to.equal(USDC(7n));
      expect(
        await market.read.claimable([seller.account.address]),
      ).to.equal(0n);
    });

    it("reverts when nothing to claim", async function () {
      const { market, seller } = await loadFixture(deployFixture);
      const m = await asWallet(market, seller);
      await expect(m.write.claim()).to.be.rejectedWith("nothing to claim");
    });
  });

  describe("Admin gating", function () {
    it("non-owner cannot set any param", async function () {
      const { market, other } = await loadFixture(deployFixture);
      const m = await asWallet(market, other);
      await expect(m.write.setRegistrationFee([1n])).to.be.rejected;
      await expect(m.write.setRegistrationBurnBps([100])).to.be.rejected;
      await expect(m.write.setServiceFeeBps([100])).to.be.rejected;
      await expect(m.write.setMaxListingsPerAccount([3])).to.be.rejected;
      await expect(
        m.write.setGateway([other.account.address, true]),
      ).to.be.rejected;
      await expect(m.write.setTreasury([other.account.address])).to.be
        .rejected;
      await expect(
        m.write.setRegistrationFeeToken([other.account.address]),
      ).to.be.rejected;
    });

    it("serviceFeeBps cap enforced", async function () {
      const { market, owner } = await loadFixture(deployFixture);
      const m = await asWallet(market, owner);
      await expect(m.write.setServiceFeeBps([3001])).to.be.rejectedWith(
        "bps too high",
      );
      await m.write.setServiceFeeBps([3000]);
      expect(await market.read.serviceFeeBps()).to.equal(3000);
    });
  });

  describe("maxListingsPerAccount", function () {
    it("enforces cap when set", async function () {
      const { market, owner, seller } = await loadFixture(deployFixture);
      const mO = await asWallet(market, owner);
      await mO.write.setMaxListingsPerAccount([2]);

      const mS = await asWallet(market, seller);
      await mS.write.register([seller.account.address, "ipfs://1"]);
      await mS.write.register([seller.account.address, "ipfs://2"]);
      await expect(
        mS.write.register([seller.account.address, "ipfs://3"]),
      ).to.be.rejectedWith("too many listings");
    });

    it("0 means unlimited", async function () {
      const { market, seller } = await loadFixture(deployFixture);
      const m = await asWallet(market, seller);
      for (let i = 0; i < 5; i++) {
        await m.write.register([seller.account.address, `ipfs://${i}`]);
      }
      expect(await market.read.nextListingId()).to.equal(5n);
    });
  });
});