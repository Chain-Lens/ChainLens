import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import {
  getAddress,
  keccak256,
  stringToBytes,
  zeroAddress,
  zeroHash,
} from "viem";

const USDC = (n: bigint) => n * 1_000_000n;
const FEE_BPS = 500n; // 5%
const TASK_A = keccak256(stringToBytes("blockscout_contract_source"));
const INPUTS_A = keccak256(stringToBytes("{addr:0xabc}"));
const RESP_A = keccak256(stringToBytes("{source:'pragma solidity'}"));
const EVIDENCE_A = "ipfs://bafyEvidence";

describe("ApiMarketEscrowV2", function () {
  async function deployFixture() {
    const [owner, gateway, buyer, seller, other] =
      await hre.viem.getWalletClients();
    const usdc = await hre.viem.deployContract("MockUSDC");
    const escrow = await hre.viem.deployContract("ApiMarketEscrowV2", [
      gateway.account.address,
      FEE_BPS,
      usdc.address,
    ]);
    const publicClient = await hre.viem.getPublicClient();

    // fund buyer and approve escrow
    await usdc.write.mint([buyer.account.address, USDC(1_000n)]);
    const usdcAsBuyer = await hre.viem.getContractAt(
      "MockUSDC",
      usdc.address,
      { client: { wallet: buyer } },
    );
    await usdcAsBuyer.write.approve([escrow.address, USDC(1_000n)]);

    return { escrow, usdc, owner, gateway, buyer, seller, other, publicClient };
  }

  async function as(contract: any, wallet: any, name = "ApiMarketEscrowV2") {
    return hre.viem.getContractAt(name, contract.address, {
      client: { wallet },
    });
  }

  describe("Deployment", function () {
    it("sets owner, gateway, feeRate, usdc", async function () {
      const { escrow, owner, gateway, usdc } = await loadFixture(deployFixture);
      expect(getAddress(await escrow.read.owner())).to.equal(
        getAddress(owner.account.address),
      );
      expect(getAddress(await escrow.read.gateway())).to.equal(
        getAddress(gateway.account.address),
      );
      expect(await escrow.read.feeRate()).to.equal(FEE_BPS);
      expect(getAddress(await escrow.read.usdc())).to.equal(
        getAddress(usdc.address),
      );
      expect(await escrow.read.nextJobId()).to.equal(0n);
    });

    it("emits GatewayUpdated on deploy", async function () {
      const { escrow, gateway, publicClient } = await loadFixture(
        deployFixture,
      );
      const logs = await publicClient.getContractEvents({
        abi: escrow.abi,
        address: escrow.address,
        eventName: "GatewayUpdated",
        fromBlock: 0n,
      });
      expect(logs).to.have.lengthOf(1);
      expect(logs[0].args.previousGateway).to.equal(zeroAddress);
      expect(getAddress(logs[0].args.newGateway as `0x${string}`)).to.equal(
        getAddress(gateway.account.address),
      );
    });

    it("reverts on zero gateway / zero usdc / feeRate > 3000", async function () {
      const { usdc, gateway } = await loadFixture(deployFixture);
      await expect(
        hre.viem.deployContract("ApiMarketEscrowV2", [
          zeroAddress,
          FEE_BPS,
          usdc.address,
        ]),
      ).to.be.rejectedWith(/zero gateway/);
      await expect(
        hre.viem.deployContract("ApiMarketEscrowV2", [
          gateway.account.address,
          FEE_BPS,
          zeroAddress,
        ]),
      ).to.be.rejectedWith(/zero usdc/);
      await expect(
        hre.viem.deployContract("ApiMarketEscrowV2", [
          gateway.account.address,
          3_001n,
          usdc.address,
        ]),
      ).to.be.rejectedWith(/fee too high/);
    });

    it("exposes constants", async function () {
      const { escrow } = await loadFixture(deployFixture);
      expect(await escrow.read.MAX_FEE_RATE_BPS()).to.equal(3_000n);
      expect(await escrow.read.BPS_DIVISOR()).to.equal(10_000n);
    });
  });

  describe("approveApi / revokeApi / setFeeRate / setGateway", function () {
    it("owner can approve/revoke API", async function () {
      const { escrow } = await loadFixture(deployFixture);
      await escrow.write.approveApi([1n]);
      expect(await escrow.read.approvedApis([1n])).to.be.true;
      await escrow.write.revokeApi([1n]);
      expect(await escrow.read.approvedApis([1n])).to.be.false;
    });

    it("non-owner cannot approveApi", async function () {
      const { escrow, other } = await loadFixture(deployFixture);
      const asOther = await as(escrow, other);
      await expect(asOther.write.approveApi([1n])).to.be.rejectedWith(
        /OwnableUnauthorizedAccount/,
      );
    });

    it("setFeeRate updates and emits", async function () {
      const { escrow, publicClient } = await loadFixture(deployFixture);
      await escrow.write.setFeeRate([1_000n]);
      expect(await escrow.read.feeRate()).to.equal(1_000n);
      const logs = await publicClient.getContractEvents({
        abi: escrow.abi,
        address: escrow.address,
        eventName: "FeeRateUpdated",
        fromBlock: 0n,
      });
      expect(logs).to.have.lengthOf(1);
      expect(logs[0].args.newRate).to.equal(1_000n);
    });

    it("setFeeRate reverts above 3000", async function () {
      const { escrow } = await loadFixture(deployFixture);
      await expect(escrow.write.setFeeRate([3_001n])).to.be.rejectedWith(
        /fee too high/,
      );
    });

    it("setGateway rotates and emits GatewayUpdated", async function () {
      const { escrow, other } = await loadFixture(deployFixture);
      await escrow.write.setGateway([other.account.address]);
      expect(getAddress(await escrow.read.gateway())).to.equal(
        getAddress(other.account.address),
      );
    });

    it("setGateway rejects zero address", async function () {
      const { escrow } = await loadFixture(deployFixture);
      await expect(escrow.write.setGateway([zeroAddress])).to.be.rejectedWith(
        /zero gateway/,
      );
    });
  });

  describe("pay (legacy path, taskType = 0)", function () {
    it("requires approved API", async function () {
      const { escrow, buyer, seller } = await loadFixture(deployFixture);
      const asBuyer = await as(escrow, buyer);
      await expect(
        asBuyer.write.pay([1n, seller.account.address, USDC(10n), zeroHash, zeroHash]),
      ).to.be.rejectedWith(/API not approved/);
    });

    it("succeeds when API approved, stores job with zeroHash fields", async function () {
      const { escrow, buyer, seller } = await loadFixture(deployFixture);
      await escrow.write.approveApi([1n]);
      const asBuyer = await as(escrow, buyer);
      await asBuyer.write.pay([
        1n,
        seller.account.address,
        USDC(10n),
        zeroHash,
        zeroHash,
      ]);
      const j = await escrow.read.getJob([0n]);
      expect(j.apiId).to.equal(1n);
      expect(j.taskType).to.equal(zeroHash);
      expect(j.amount).to.equal(USDC(10n));
      expect(j.completed).to.be.false;
      expect(j.refunded).to.be.false;
    });
  });

  describe("pay / createJob (task-type path)", function () {
    it("pay with taskType != 0 bypasses approvedApis", async function () {
      const { escrow, buyer, seller } = await loadFixture(deployFixture);
      const asBuyer = await as(escrow, buyer);
      await asBuyer.write.pay([
        0n, // apiId ignored in task-type path
        seller.account.address,
        USDC(5n),
        TASK_A,
        INPUTS_A,
      ]);
      const j = await escrow.read.getJob([0n]);
      expect(j.taskType).to.equal(TASK_A);
      expect(j.inputsHash).to.equal(INPUTS_A);
    });

    it("createJob alias routes to same storage + same events", async function () {
      const { escrow, buyer, seller, publicClient } = await loadFixture(
        deployFixture,
      );
      const asBuyer = await as(escrow, buyer);
      await asBuyer.write.createJob([
        seller.account.address,
        TASK_A,
        USDC(5n),
        INPUTS_A,
        42n, // apiId passed through for context
      ]);
      const j = await escrow.read.getJob([0n]);
      expect(j.apiId).to.equal(42n);
      expect(j.taskType).to.equal(TASK_A);

      const created = await publicClient.getContractEvents({
        abi: escrow.abi,
        address: escrow.address,
        eventName: "JobCreated",
        fromBlock: 0n,
      });
      expect(created).to.have.lengthOf(1);
      expect(created[0].args.taskType).to.equal(TASK_A);

      const received = await publicClient.getContractEvents({
        abi: escrow.abi,
        address: escrow.address,
        eventName: "PaymentReceived",
        fromBlock: 0n,
      });
      expect(received).to.have.lengthOf(1); // legacy event also emitted
    });

    it("reverts on zero seller / zero amount", async function () {
      const { escrow, buyer } = await loadFixture(deployFixture);
      const asBuyer = await as(escrow, buyer);
      await expect(
        asBuyer.write.pay([0n, zeroAddress, USDC(1n), TASK_A, INPUTS_A]),
      ).to.be.rejectedWith(/invalid seller/);
      await expect(
        asBuyer.write.pay([
          0n,
          (await hre.viem.getWalletClients())[3].account.address,
          0n,
          TASK_A,
          INPUTS_A,
        ]),
      ).to.be.rejectedWith(/amount zero/);
    });

    it("transfers USDC to escrow balance", async function () {
      const { escrow, usdc, buyer, seller } = await loadFixture(deployFixture);
      const asBuyer = await as(escrow, buyer);
      await asBuyer.write.pay([
        0n,
        seller.account.address,
        USDC(10n),
        TASK_A,
        INPUTS_A,
      ]);
      expect(await usdc.read.balanceOf([escrow.address])).to.equal(USDC(10n));
      expect(await usdc.read.balanceOf([buyer.account.address])).to.equal(
        USDC(990n),
      );
    });

    it("increments nextJobId", async function () {
      const { escrow, buyer, seller } = await loadFixture(deployFixture);
      const asBuyer = await as(escrow, buyer);
      await asBuyer.write.pay([
        0n,
        seller.account.address,
        USDC(1n),
        TASK_A,
        INPUTS_A,
      ]);
      await asBuyer.write.pay([
        0n,
        seller.account.address,
        USDC(2n),
        TASK_A,
        INPUTS_A,
      ]);
      expect(await escrow.read.nextJobId()).to.equal(2n);
    });
  });

  describe("complete / submit", function () {
    async function withJob() {
      const fx = await loadFixture(deployFixture);
      const asBuyer = await as(fx.escrow, fx.buyer);
      await asBuyer.write.pay([
        0n,
        fx.seller.account.address,
        USDC(10n),
        TASK_A,
        INPUTS_A,
      ]);
      return fx;
    }

    it("gateway can complete, records responseHash/evidenceURI, splits funds", async function () {
      const fx = await withJob();
      const asGateway = await as(fx.escrow, fx.gateway);
      await asGateway.write.complete([0n, RESP_A, EVIDENCE_A]);

      const j = await fx.escrow.read.getJob([0n]);
      expect(j.completed).to.be.true;
      expect(j.responseHash).to.equal(RESP_A);
      expect(j.evidenceURI).to.equal(EVIDENCE_A);

      // fee 5% of 10 USDC = 0.5 USDC → owner; seller gets 9.5 USDC
      const fee = (USDC(10n) * FEE_BPS) / 10_000n;
      const sellerPortion = USDC(10n) - fee;
      expect(
        await fx.escrow.read.pendingWithdrawals([fx.seller.account.address]),
      ).to.equal(sellerPortion);
      expect(
        await fx.escrow.read.pendingWithdrawals([fx.owner.account.address]),
      ).to.equal(fee);
    });

    it("emits JobSubmitted and PaymentCompleted", async function () {
      const fx = await withJob();
      const asGateway = await as(fx.escrow, fx.gateway);
      await asGateway.write.complete([0n, RESP_A, EVIDENCE_A]);
      const submitted = await fx.publicClient.getContractEvents({
        abi: fx.escrow.abi,
        address: fx.escrow.address,
        eventName: "JobSubmitted",
        fromBlock: 0n,
      });
      expect(submitted).to.have.lengthOf(1);
      expect(submitted[0].args.responseHash).to.equal(RESP_A);
      expect(submitted[0].args.evidenceURI).to.equal(EVIDENCE_A);

      const completed = await fx.publicClient.getContractEvents({
        abi: fx.escrow.abi,
        address: fx.escrow.address,
        eventName: "PaymentCompleted",
        fromBlock: 0n,
      });
      expect(completed).to.have.lengthOf(1);
    });

    it("submit alias works the same", async function () {
      const fx = await withJob();
      const asGateway = await as(fx.escrow, fx.gateway);
      await asGateway.write.submit([0n, RESP_A, EVIDENCE_A]);
      const j = await fx.escrow.read.getJob([0n]);
      expect(j.completed).to.be.true;
      expect(j.responseHash).to.equal(RESP_A);
    });

    it("accepts empty responseHash and empty evidenceURI", async function () {
      const fx = await withJob();
      const asGateway = await as(fx.escrow, fx.gateway);
      await asGateway.write.complete([0n, zeroHash, ""]);
      const j = await fx.escrow.read.getJob([0n]);
      expect(j.completed).to.be.true;
      expect(j.responseHash).to.equal(zeroHash);
      expect(j.evidenceURI).to.equal("");
    });

    it("reverts for non-gateway caller", async function () {
      const fx = await withJob();
      const asBuyer = await as(fx.escrow, fx.buyer);
      await expect(
        asBuyer.write.complete([0n, RESP_A, EVIDENCE_A]),
      ).to.be.rejectedWith(/only gateway/);
    });

    it("reverts on job not found", async function () {
      const { escrow, gateway } = await loadFixture(deployFixture);
      const asGateway = await as(escrow, gateway);
      await expect(
        asGateway.write.complete([99n, RESP_A, EVIDENCE_A]),
      ).to.be.rejectedWith(/job not found/);
    });

    it("reverts on double-complete and complete-after-refund", async function () {
      const fx = await withJob();
      const asGateway = await as(fx.escrow, fx.gateway);
      await asGateway.write.complete([0n, RESP_A, EVIDENCE_A]);
      await expect(
        asGateway.write.complete([0n, RESP_A, EVIDENCE_A]),
      ).to.be.rejectedWith(/already completed/);

      // new job, then refund, then try complete
      const asBuyer = await as(fx.escrow, fx.buyer);
      await asBuyer.write.pay([
        0n,
        fx.seller.account.address,
        USDC(1n),
        TASK_A,
        INPUTS_A,
      ]);
      await asGateway.write.refund([1n]);
      await expect(
        asGateway.write.complete([1n, RESP_A, EVIDENCE_A]),
      ).to.be.rejectedWith(/already refunded/);
    });

    it("zero feeRate sends 100% to seller", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.escrow.write.setFeeRate([0n]);
      const asBuyer = await as(fx.escrow, fx.buyer);
      await asBuyer.write.pay([
        0n,
        fx.seller.account.address,
        USDC(10n),
        TASK_A,
        INPUTS_A,
      ]);
      const asGateway = await as(fx.escrow, fx.gateway);
      await asGateway.write.complete([0n, RESP_A, EVIDENCE_A]);
      expect(
        await fx.escrow.read.pendingWithdrawals([fx.seller.account.address]),
      ).to.equal(USDC(10n));
      expect(
        await fx.escrow.read.pendingWithdrawals([fx.owner.account.address]),
      ).to.equal(0n);
    });
  });

  describe("refund", function () {
    async function withJob() {
      const fx = await loadFixture(deployFixture);
      const asBuyer = await as(fx.escrow, fx.buyer);
      await asBuyer.write.pay([
        0n,
        fx.seller.account.address,
        USDC(10n),
        TASK_A,
        INPUTS_A,
      ]);
      return fx;
    }

    it("gateway refunds buyer directly (no claim needed)", async function () {
      const fx = await withJob();
      const asGateway = await as(fx.escrow, fx.gateway);
      const before = await fx.usdc.read.balanceOf([fx.buyer.account.address]);
      await asGateway.write.refund([0n]);
      const after = await fx.usdc.read.balanceOf([fx.buyer.account.address]);
      expect(after - before).to.equal(USDC(10n));
      const j = await fx.escrow.read.getJob([0n]);
      expect(j.refunded).to.be.true;
    });

    it("reverts for non-gateway", async function () {
      const fx = await withJob();
      const asBuyer = await as(fx.escrow, fx.buyer);
      await expect(asBuyer.write.refund([0n])).to.be.rejectedWith(
        /only gateway/,
      );
    });

    it("reverts on double-refund", async function () {
      const fx = await withJob();
      const asGateway = await as(fx.escrow, fx.gateway);
      await asGateway.write.refund([0n]);
      await expect(asGateway.write.refund([0n])).to.be.rejectedWith(
        /already refunded/,
      );
    });

    it("reverts after complete", async function () {
      const fx = await withJob();
      const asGateway = await as(fx.escrow, fx.gateway);
      await asGateway.write.complete([0n, RESP_A, EVIDENCE_A]);
      await expect(asGateway.write.refund([0n])).to.be.rejectedWith(
        /already completed/,
      );
    });
  });

  describe("claim", function () {
    it("seller can claim after complete", async function () {
      const fx = await loadFixture(deployFixture);
      const asBuyer = await as(fx.escrow, fx.buyer);
      await asBuyer.write.pay([
        0n,
        fx.seller.account.address,
        USDC(10n),
        TASK_A,
        INPUTS_A,
      ]);
      const asGateway = await as(fx.escrow, fx.gateway);
      await asGateway.write.complete([0n, RESP_A, EVIDENCE_A]);

      const fee = (USDC(10n) * FEE_BPS) / 10_000n;
      const sellerPortion = USDC(10n) - fee;

      const asSeller = await as(fx.escrow, fx.seller);
      await asSeller.write.claim();
      expect(await fx.usdc.read.balanceOf([fx.seller.account.address])).to.equal(
        sellerPortion,
      );
      expect(
        await fx.escrow.read.pendingWithdrawals([fx.seller.account.address]),
      ).to.equal(0n);
    });

    it("reverts when nothing to claim", async function () {
      const { escrow, other } = await loadFixture(deployFixture);
      const asOther = await as(escrow, other);
      await expect(asOther.write.claim()).to.be.rejectedWith(/nothing to claim/);
    });
  });

  describe("getJob / getPayment", function () {
    it("both revert for unknown id", async function () {
      const { escrow } = await loadFixture(deployFixture);
      await expect(escrow.read.getJob([0n])).to.be.rejectedWith(/job not found/);
      await expect(escrow.read.getPayment([0n])).to.be.rejectedWith(
        /job not found/,
      );
    });

    it("return the same struct", async function () {
      const { escrow, buyer, seller } = await loadFixture(deployFixture);
      const asBuyer = await as(escrow, buyer);
      await asBuyer.write.pay([
        0n,
        seller.account.address,
        USDC(3n),
        TASK_A,
        INPUTS_A,
      ]);
      const a = await escrow.read.getJob([0n]);
      const b = await escrow.read.getPayment([0n]);
      expect(a).to.deep.equal(b);
    });
  });

  describe("Ownable2Step", function () {
    it("2-step ownership transfer gates owner-only functions", async function () {
      const { escrow, other } = await loadFixture(deployFixture);
      await escrow.write.transferOwnership([other.account.address]);
      const asOther = await as(escrow, other);
      await asOther.write.acceptOwnership();
      await asOther.write.approveApi([7n]);
      expect(await escrow.read.approvedApis([7n])).to.be.true;
    });
  });

  describe("createJobWithAuth (EIP-3009)", function () {
    // Validity window constants picked wide enough to always cover the hardhat
    // block clock during test execution; each test overrides when it needs
    // to exercise the boundary.
    const VALID_AFTER = 0n;
    const VALID_BEFORE = 2_000_000_000n; // 2033-05-18
    const NONCE_A = keccak256(stringToBytes("auth-nonce-a"));
    const NONCE_B = keccak256(stringToBytes("auth-nonce-b"));
    // MockUSDC ignores the signature, so any v/r/s are fine. Real USDC
    // verifies EIP-712 — exercised in the mcp-tool integration tests.
    const V = 27;
    const R = keccak256(stringToBytes("dummy-r")) as `0x${string}`;
    const S = keccak256(stringToBytes("dummy-s")) as `0x${string}`;

    async function authFixture() {
      const base = await deployFixture();
      // Revoke the standard approve so we prove auth path doesn't rely on
      // an existing allowance.
      const usdcAsBuyer = await hre.viem.getContractAt(
        "MockUSDC",
        base.usdc.address,
        { client: { wallet: base.buyer } },
      );
      await usdcAsBuyer.write.approve([base.escrow.address, 0n]);
      return { ...base, usdcAsBuyer };
    }

    it("creates a job by redeeming the authorization — no approve needed", async function () {
      const { escrow, usdc, buyer, seller } = await authFixture();
      const asBuyer = await as(escrow, buyer);

      const escrowBalBefore = await usdc.read.balanceOf([escrow.address]);
      const buyerBalBefore = await usdc.read.balanceOf([buyer.account.address]);

      await asBuyer.write.createJobWithAuth([
        seller.account.address,
        TASK_A,
        USDC(5n),
        INPUTS_A,
        123n,
        VALID_AFTER,
        VALID_BEFORE,
        NONCE_A,
        V,
        R,
        S,
      ]);

      const job = await escrow.read.getJob([0n]);
      expect(getAddress(job.buyer)).to.equal(getAddress(buyer.account.address));
      expect(getAddress(job.seller)).to.equal(getAddress(seller.account.address));
      expect(job.amount).to.equal(USDC(5n));
      expect(job.apiId).to.equal(123n);

      expect(await usdc.read.balanceOf([escrow.address])).to.equal(
        escrowBalBefore + USDC(5n),
      );
      expect(await usdc.read.balanceOf([buyer.account.address])).to.equal(
        buyerBalBefore - USDC(5n),
      );
    });

    it("reverts when the authorization has expired", async function () {
      const { escrow, buyer, seller } = await authFixture();
      const asBuyer = await as(escrow, buyer);
      await expect(
        asBuyer.write.createJobWithAuth([
          seller.account.address,
          TASK_A,
          USDC(1n),
          INPUTS_A,
          0n,
          0n,
          1n, // validBefore in the past
          NONCE_A,
          V,
          R,
          S,
        ]),
      ).to.be.rejectedWith(/auth expired/);
    });

    it("reverts when the same nonce is redeemed twice (replay protection)", async function () {
      const { escrow, buyer, seller } = await authFixture();
      const asBuyer = await as(escrow, buyer);

      await asBuyer.write.createJobWithAuth([
        seller.account.address,
        TASK_A,
        USDC(1n),
        INPUTS_A,
        0n,
        VALID_AFTER,
        VALID_BEFORE,
        NONCE_A,
        V,
        R,
        S,
      ]);
      await expect(
        asBuyer.write.createJobWithAuth([
          seller.account.address,
          TASK_A,
          USDC(1n),
          INPUTS_A,
          0n,
          VALID_AFTER,
          VALID_BEFORE,
          NONCE_A, // same nonce — USDC rejects
          V,
          R,
          S,
        ]),
      ).to.be.rejectedWith(/auth already used/);
    });

    it("rejects zero amount and zero seller", async function () {
      const { escrow, buyer, seller } = await authFixture();
      const asBuyer = await as(escrow, buyer);

      await expect(
        asBuyer.write.createJobWithAuth([
          seller.account.address,
          TASK_A,
          0n,
          INPUTS_A,
          0n,
          VALID_AFTER,
          VALID_BEFORE,
          NONCE_A,
          V,
          R,
          S,
        ]),
      ).to.be.rejectedWith(/amount zero/);

      await expect(
        asBuyer.write.createJobWithAuth([
          zeroAddress,
          TASK_A,
          USDC(1n),
          INPUTS_A,
          0n,
          VALID_AFTER,
          VALID_BEFORE,
          NONCE_B,
          V,
          R,
          S,
        ]),
      ).to.be.rejectedWith(/invalid seller/);
    });

    it("parallel nonces work — both independent auths redeem in sequence", async function () {
      const { escrow, buyer, seller } = await authFixture();
      const asBuyer = await as(escrow, buyer);

      await asBuyer.write.createJobWithAuth([
        seller.account.address,
        TASK_A,
        USDC(1n),
        INPUTS_A,
        0n,
        VALID_AFTER,
        VALID_BEFORE,
        NONCE_A,
        V,
        R,
        S,
      ]);
      await asBuyer.write.createJobWithAuth([
        seller.account.address,
        TASK_A,
        USDC(1n),
        INPUTS_A,
        0n,
        VALID_AFTER,
        VALID_BEFORE,
        NONCE_B,
        V,
        R,
        S,
      ]);

      const j0 = await escrow.read.getJob([0n]);
      const j1 = await escrow.read.getJob([1n]);
      expect(j0.amount).to.equal(USDC(1n));
      expect(j1.amount).to.equal(USDC(1n));
    });
  });
});
