import { expect } from "chai";
import hre from "hardhat";
import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { getAddress, parseUnits } from "viem";

const PAYMENT_AMOUNT = parseUnits("1", 6);

describe("ApiMarketEscrow", function () {
  async function deployFixture() {
    const [owner, gateway, buyer, seller, other] =
      await hre.viem.getWalletClients();

    const usdc = await hre.viem.deployContract("MockUSDC");
    const escrow = await hre.viem.deployContract("ApiMarketEscrow", [
      gateway.account.address,
      0n,
      usdc.address,
    ]);

    await usdc.write.mint([buyer.account.address, PAYMENT_AMOUNT]);

    const usdcAsBuyer = await hre.viem.getContractAt("MockUSDC", usdc.address, {
      client: { wallet: buyer },
    });
    await usdcAsBuyer.write.approve([escrow.address, PAYMENT_AMOUNT]);

    const escrowAsBuyer = await hre.viem.getContractAt(
      "ApiMarketEscrow",
      escrow.address,
      { client: { wallet: buyer } }
    );
    const escrowAsGateway = await hre.viem.getContractAt(
      "ApiMarketEscrow",
      escrow.address,
      { client: { wallet: gateway } }
    );
    const escrowAsSeller = await hre.viem.getContractAt(
      "ApiMarketEscrow",
      escrow.address,
      { client: { wallet: seller } }
    );
    const escrowAsOther = await hre.viem.getContractAt(
      "ApiMarketEscrow",
      escrow.address,
      { client: { wallet: other } }
    );

    return {
      escrow,
      usdc,
      owner,
      gateway,
      buyer,
      seller,
      other,
      escrowAsBuyer,
      escrowAsGateway,
      escrowAsSeller,
      escrowAsOther,
    };
  }

  async function createPayment() {
    const fixture = await deployFixture();
    await fixture.escrow.write.approveApi([1n]);
    await fixture.escrowAsBuyer.write.pay([
      1n,
      fixture.seller.account.address,
      PAYMENT_AMOUNT,
    ]);
    return fixture;
  }

  describe("Deployment", function () {
    it("sets owner, gateway, usdc, and nextPaymentId", async function () {
      const { escrow, owner, gateway, usdc } = await loadFixture(deployFixture);

      expect(getAddress(await escrow.read.owner())).to.equal(
        getAddress(owner.account.address)
      );
      expect(getAddress(await escrow.read.gateway())).to.equal(
        getAddress(gateway.account.address)
      );
      expect(getAddress(await escrow.read.usdc())).to.equal(
        getAddress(usdc.address)
      );
      expect(await escrow.read.nextPaymentId()).to.equal(0n);
    });
  });

  describe("API Approval", function () {
    it("approves and revokes an API", async function () {
      const { escrow } = await loadFixture(deployFixture);

      await escrow.write.approveApi([1n]);
      expect(await escrow.read.approvedApis([1n])).to.equal(true);

      await escrow.write.revokeApi([1n]);
      expect(await escrow.read.approvedApis([1n])).to.equal(false);
    });

    it("restricts approval changes to owner", async function () {
      const { escrowAsOther } = await loadFixture(deployFixture);

      await expect(escrowAsOther.write.approveApi([1n])).to.be.rejectedWith(
        "Only owner"
      );
      await expect(escrowAsOther.write.revokeApi([1n])).to.be.rejectedWith(
        "Only owner"
      );
    });
  });

  describe("Payment", function () {
    it("stores approved USDC payments", async function () {
      const { escrow, buyer, seller, usdc } = await loadFixture(createPayment);

      const payment = await escrow.read.getPayment([0n]);
      expect(getAddress(payment.buyer)).to.equal(getAddress(buyer.account.address));
      expect(getAddress(payment.seller)).to.equal(getAddress(seller.account.address));
      expect(payment.apiId).to.equal(1n);
      expect(payment.amount).to.equal(PAYMENT_AMOUNT);
      expect(payment.completed).to.equal(false);
      expect(payment.refunded).to.equal(false);
      expect(await escrow.read.nextPaymentId()).to.equal(1n);
      expect(await usdc.read.balanceOf([escrow.address])).to.equal(PAYMENT_AMOUNT);
    });

    it("rejects unapproved APIs", async function () {
      const { escrowAsBuyer, seller } = await loadFixture(deployFixture);

      await expect(
        escrowAsBuyer.write.pay([99n, seller.account.address, PAYMENT_AMOUNT])
      ).to.be.rejectedWith("API not approved");
    });
  });

  describe("Complete", function () {
    it("marks payments complete and accrues seller withdrawals", async function () {
      const { escrow, escrowAsGateway, seller } = await loadFixture(createPayment);

      await escrowAsGateway.write.complete([0n]);

      const payment = await escrow.read.getPayment([0n]);
      expect(payment.completed).to.equal(true);
      expect(await escrow.read.pendingWithdrawals([seller.account.address])).to.equal(
        PAYMENT_AMOUNT
      );
    });

    it("lets seller claim accrued USDC", async function () {
      const { escrow, escrowAsGateway, escrowAsSeller, seller, usdc } =
        await loadFixture(createPayment);

      await escrowAsGateway.write.complete([0n]);
      const before = await usdc.read.balanceOf([seller.account.address]);

      await escrowAsSeller.write.claim();

      const after = await usdc.read.balanceOf([seller.account.address]);
      expect(after - before).to.equal(PAYMENT_AMOUNT);
      expect(await escrow.read.pendingWithdrawals([seller.account.address])).to.equal(0n);
    });

    it("restricts complete to gateway", async function () {
      const { escrowAsOther } = await loadFixture(createPayment);

      await expect(escrowAsOther.write.complete([0n])).to.be.rejectedWith(
        "Only gateway"
      );
    });
  });

  describe("Refund", function () {
    it("refunds buyer in USDC", async function () {
      const { escrow, escrowAsGateway, buyer, usdc } = await loadFixture(createPayment);

      const before = await usdc.read.balanceOf([buyer.account.address]);
      await escrowAsGateway.write.refund([0n]);
      const after = await usdc.read.balanceOf([buyer.account.address]);

      expect(after - before).to.equal(PAYMENT_AMOUNT);
      expect((await escrow.read.getPayment([0n])).refunded).to.equal(true);
    });

    it("blocks invalid refund transitions", async function () {
      const { escrowAsGateway } = await loadFixture(createPayment);

      await escrowAsGateway.write.refund([0n]);
      await expect(escrowAsGateway.write.refund([0n])).to.be.rejectedWith(
        "Already refunded"
      );
    });

    it("does not allow refund after complete", async function () {
      const { escrowAsGateway } = await loadFixture(createPayment);

      await escrowAsGateway.write.complete([0n]);
      await expect(escrowAsGateway.write.refund([0n])).to.be.rejectedWith(
        "Already completed"
      );
    });
  });

  describe("Admin functions", function () {
    it("allows owner to change gateway and ownership", async function () {
      const { escrow, other } = await loadFixture(deployFixture);

      await escrow.write.setGateway([other.account.address]);
      expect(getAddress(await escrow.read.gateway())).to.equal(
        getAddress(other.account.address)
      );

      await escrow.write.transferOwnership([other.account.address]);
      expect(getAddress(await escrow.read.owner())).to.equal(
        getAddress(other.account.address)
      );
    });
  });
});
