const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = ethers;

const abiCoder = ethers.utils.defaultAbiCoder;

describe('ERC20_Game_Currency', () => {
  const systemId = ethers.utils.id('121251a-seghjsbeg-21412');

  let systemDelegateApproverAddress;
  let systemDelegateApproverContract;
  let forwarderAddress;
  let forwarderContract;
  let tokenContract;
  let owner;
  let childChainManager;
  let otherAddresses;

  beforeEach(async () => {
    const [ _owner, ..._otherAddresses ] = await ethers.getSigners();

    const System_Delegate_Approver = await ethers.getContractFactory('System_Delegate_Approver');
    const ERC2771_Trusted_Forwarder = await ethers.getContractFactory('ERC2771_Trusted_Forwarder');
    const ERC20_Game_Currency = await ethers.getContractFactory('ERC20_Game_Currency');

    owner = _owner;
    otherAddresses = _otherAddresses;

    systemDelegateApproverContract = await System_Delegate_Approver.deploy();
    systemDelegateApproverAddress = systemDelegateApproverContract.address;

    forwarderContract = await ERC2771_Trusted_Forwarder.deploy(systemDelegateApproverAddress);
    forwarderAddress = forwarderContract.address;

    childChainManager = _otherAddresses[1]; // For testing, production would point at the polygon bridge.

    tokenContract = await ERC20_Game_Currency.deploy(
      "My Game Token",
      "MGT",
      getTokenDecimalAmount(1000000),
      forwarderAddress,
      systemId,
    );
  });

  /*
   * General Tests
   */

  it('Should deploy', async () => {
    await forwarderContract.deployed();
    await tokenContract.deployed();
  });

  it('Should return the expected decimals', async () => {
    expect(await tokenContract.decimals()).to.equal(18);
  });

  it('Should return the expected systemId', async () => {
    expect(await tokenContract.systemId()).to.equal(systemId);
  });

  it('Should return the expected trustedForwarder', async () => {
    expect(await tokenContract.trustedForwarder()).to.equal(forwarderAddress);
  });

  it('Should mint, transfer and burn tokens', async () => {
    await tokenContract.deployed();

    const amount = getTokenDecimalAmount(2500);

    await tokenContract.mint(owner.address, amount);
    expect(await tokenContract.totalSupply()).to.equal(amount);

    const recipientAddress = otherAddresses[0].address;
    const transferAmount = getTokenDecimalAmount(25);
    await tokenContract.transfer(recipientAddress, transferAmount);

    expect(await tokenContract.balanceOf(owner.address) * 1).to.equal(amount * 1 - transferAmount * 1);
    expect(await tokenContract.balanceOf(recipientAddress)).to.equal(transferAmount);

    await tokenContract.connect(otherAddresses[0]).burn(getTokenDecimalAmount(15));
    expect(await tokenContract.balanceOf(recipientAddress)).to.equal(getTokenDecimalAmount(10));
  });

  it('Should properly handle role management and assignments', async () => {
    await tokenContract.deployed();

    const manager = otherAddresses[0];
    const target = otherAddresses[1];
    const targetTwo = otherAddresses[2];

    await tokenContract.grantRole(ethers.utils.id('METAFAB_MANAGER_ROLE'), manager.address); // admin can assign manager
    await tokenContract.connect(manager).grantRole(ethers.utils.id('METAFAB_MINTER_ROLE'), target.address); // manager can assign all non-admin/non-manager roles
    await expect(tokenContract.connect(manager).grantRole(ethers.utils.id('METAFAB_MANAGER_ROLE'), target.address)).to.be.reverted; // manager cannot assign manager role
    await expect(tokenContract.connect(manager).grantRole(ethers.constants.HashZero, target.address)).to.be.reverted // manager cannot assign admin role
    await expect(tokenContract.connect(target).grantRole(ethers.utils.id('METAFAB_MANAGER_ROLE'), targetTwo.address)).to.be.reverted; // random address cannot assign roles
    await expect(tokenContract.connect(target).grantRole(ethers.utils.id('RANDOM_ROLE'), targetTwo.address)).to.be.reverted; // random address cannot assign roles
  });

  it('Should transfer ownership', async () => {
    await tokenContract.deployed();

    const newOwnerAddress = otherAddresses[0].address;

    expect(await tokenContract.owner()).to.equal(owner.address);
    await tokenContract.transferOwnership(newOwnerAddress);
    expect(await tokenContract.owner()).to.equal(newOwnerAddress);
    await expect(tokenContract.transferOwnership(newOwnerAddress)).to.be.reverted;
  });

  it('Should transfer ownership and control', async () => {
    await tokenContract.deployed();

    const newOwnerAddress = otherAddresses[0].address;

    expect(await tokenContract.hasRole(ethers.constants.HashZero, owner.address)).to.equal(true);
    expect(await tokenContract.hasRole(ethers.constants.HashZero, newOwnerAddress)).to.equal(false);
    expect(await tokenContract.owner()).to.equal(owner.address);
    await tokenContract.transferOwnershipControl(newOwnerAddress);
    expect(await tokenContract.owner()).to.equal(newOwnerAddress);
    await expect(tokenContract.transferOwnership(newOwnerAddress)).to.be.reverted;
    await expect(tokenContract.transferOwnershipControl(newOwnerAddress)).to.be.reverted;
    expect(await tokenContract.hasRole(ethers.constants.HashZero, owner.address)).to.equal(false);
    expect(await tokenContract.hasRole(ethers.constants.HashZero, newOwnerAddress)).to.equal(true);
  });

  /*
   * Bridge Tests
   */

  it('Should return the right total supply after bridge deposit when childChainManager is set', async () => {
    await tokenContract.deployed();

    const amount = getTokenDecimalAmount(2500);
    const encodedAmount = abiCoder.encode(
      [ 'uint256' ],
      [ amount ],
    );

    await tokenContract.updateChildChainManager(childChainManager.address);
    await tokenContract.connect(childChainManager).deposit(owner.address, encodedAmount);

    expect(await tokenContract.totalSupply()).to.equal(amount);
  });

  it('Should update child chain manager', async () => {
    await tokenContract.deployed();

    const newChildChainManagerAddress = otherAddresses[3].address;

    await tokenContract.updateChildChainManager(newChildChainManagerAddress);

    expect(await tokenContract.childChainManagerProxy()).to.equal(newChildChainManagerAddress);
  });

  it('Fails when depositing more than the supply cap', async () => {
    await tokenContract.deployed();

    const amount = getTokenDecimalAmount(1000000);
    const encodedAmount = abiCoder.encode(
      [ 'uint256' ],
      [ amount ],
    );

    await tokenContract.updateChildChainManager(childChainManager.address);
    await tokenContract.connect(childChainManager).deposit(owner.address, encodedAmount);

    const overAmount = getTokenDecimalAmount(1);
    const encodedOverAmount = abiCoder.encode(
      [ 'uint256' ],
      [ overAmount ],
    );

    await expect(tokenContract.connect(childChainManager).deposit(owner.address, encodedOverAmount)).to.be.reverted;
  });

  it('Fails to deposit when sender is not childChainManager', async () => {
    await tokenContract.deployed();

    await tokenContract.updateChildChainManager(childChainManager.address);

    await expect(
      tokenContract
        .connect(otherAddresses[3])
        .deposit(
          otherAddresses[3].address,
          getTokenDecimalAmount(100),
        ),
    ).to.be.reverted;
  });

  it('Fails to mint when bridge is enabled by childChainManager being set', async () => {
    await tokenContract.deployed();

    // mint works before chain manager is set.
    await tokenContract.mint(otherAddresses[1].address, getTokenDecimalAmount(100));

    await tokenContract.updateChildChainManager(childChainManager.address);

    await expect(
      tokenContract.mint(
        otherAddresses[1].address,
        getTokenDecimalAmount(100)
      ),
    ).to.be.reverted;
  });

  /*
   * Batch Transfer Tests
   */

  it('Should support batch transferring of tokens', async () => {
    await tokenContract.deployed();

    const sender = otherAddresses[0];
    const batchAmount = getTokenDecimalAmount(1800);
    const mintAmount = getTokenDecimalAmount(1800);

    const receivers = [];
    const amounts = [];
    const refs = [];

    for (let i = 1; i < otherAddresses.length; i++) {
      receivers.push(otherAddresses[i].address);
      amounts.push(getTokenDecimalAmount(100));
      refs.push(i + 1);
    }

    await tokenContract.mint(sender.address, mintAmount);

    await tokenContract.connect(sender).batchTransfer(receivers, amounts);

    for (let i = 1; i < otherAddresses.length; i++) {
      expect(await tokenContract.balanceOf(otherAddresses[i].address) * 1).to.equal(getTokenDecimalAmount(100) * 1);
    }
  });

  it('Should support batch transferring of tokens with refs', async () => {
    await tokenContract.deployed();

    const sender = otherAddresses[0];
    const batchAmount = getTokenDecimalAmount(1800);
    const mintAmount = getTokenDecimalAmount(1800);

    const receivers = [];
    const amounts = [];
    const refs = [];

    for (let i = 1; i < otherAddresses.length; i++) {
      receivers.push(otherAddresses[i].address);
      amounts.push(getTokenDecimalAmount(100));
      refs.push(i + 1);
    }

    await tokenContract.mint(sender.address, mintAmount);

    const batchEventPromise = new Promise(resolve => {
      tokenContract.on('BatchTransferRef', (_sender, _recipients, _amounts, _refs) => {
        resolve();
      });
    });

    const transferEventPromise = new Promise(resolve => {
      tokenContract.on('TransferRef', (_sender, _recipient, _amount, _ref) => {
        resolve();
      });
    });

    await tokenContract.connect(sender).batchTransferWithRefs(receivers, amounts, refs);
    await batchEventPromise;
    await transferEventPromise;

    for (let i = 1; i < otherAddresses.length; i++) {
      expect(await tokenContract.balanceOf(otherAddresses[i].address) * 1).to.equal(getTokenDecimalAmount(100) * 1);
    }
  });

  /*
   * Fee Tests
   */

  it('Should transfer tokens with fee', async () => {
      await tokenContract.deployed();

      const amount = getTokenDecimalAmount(25000);
      const encodedAmount = abiCoder.encode(
        [ 'uint256' ],
        [ amount ],
      );

      await tokenContract.mint(owner.address, encodedAmount);
      expect(await tokenContract.totalSupply()).to.equal(amount);

      const feeRecipientAddress = otherAddresses[0].address;
      const basisPoints = 50;
      const fixedFee = getTokenDecimalAmount(50);
      const feeCap = getTokenDecimalAmount(1000);
      await tokenContract.setFees(feeRecipientAddress, basisPoints, fixedFee, feeCap);

      const recipientAddress = otherAddresses[1].address;
      const transferAmount = getTokenDecimalAmount(10000);
      await tokenContract.transferWithFee(recipientAddress, transferAmount);

      expect(await tokenContract.balanceOf(feeRecipientAddress) * 1).to.equal(transferAmount * 0.005 + fixedFee * 1);
      expect(await tokenContract.balanceOf(recipientAddress) * 1).to.equal(transferAmount * 0.995 - fixedFee * 1);
    });

    it('Should transfer tokens with fee and ref', async () => {
      await tokenContract.deployed();

      const amount = getTokenDecimalAmount(25000);
      const encodedAmount = abiCoder.encode(
        [ 'uint256' ],
        [ amount ],
      );

      const ref = 999;

      await tokenContract.mint(owner.address, encodedAmount);
      expect(await tokenContract.totalSupply()).to.equal(amount);

      const feeRecipientAddress = otherAddresses[0].address;
      const basisPoints = 50;
      const fixedFee = getTokenDecimalAmount(50);
      const feeCap = getTokenDecimalAmount(1000);
      await tokenContract.setFees(feeRecipientAddress, basisPoints, fixedFee, feeCap);

      const recipientAddress = otherAddresses[1].address;
      const transferAmount = getTokenDecimalAmount(10000);
      const eventPromise = new Promise(resolve => {
        tokenContract.on('TransferRef', (_sender, _recipient, _amount, _ref) => {
          expect(_sender).to.equal(owner.address);
          expect(_recipient).to.equal(recipientAddress);
          expect(_amount * 1).to.equal(transferAmount * 1);
          expect(_ref * 1).to.equal(ref);
          resolve();
        });
      });

      await tokenContract.transferWithFeeRef(recipientAddress, transferAmount, ref);
      await eventPromise;

      expect(await tokenContract.balanceOf(feeRecipientAddress) * 1).to.equal(transferAmount * 0.005 + fixedFee * 1);
      expect(await tokenContract.balanceOf(recipientAddress) * 1).to.equal(transferAmount * 0.995 - fixedFee * 1);
    });

    it('Should transfer tokens with ref and emit ref event', async () => {
      await tokenContract.deployed();

      const amount = getTokenDecimalAmount(25000);
      const encodedAmount = abiCoder.encode(
        [ 'uint256' ],
        [ amount ],
      );

      await tokenContract.mint(owner.address, encodedAmount);
      expect(await tokenContract.totalSupply()).to.equal(amount);

      const recipientAddress = otherAddresses[0].address;
      const transferAmount = getTokenDecimalAmount(1000);
      const ref = 123;

      const eventPromise = new Promise(resolve => {
        tokenContract.on('TransferRef', (_sender, _recipient, _amount, _ref) => {
          expect(_sender).to.equal(owner.address);
          expect(_recipient).to.equal(recipientAddress);
          expect(_amount * 1).to.equal(transferAmount * 1);
          expect(_ref * 1).to.equal(ref);
          resolve();
        });
      });

      await tokenContract.transferWithRef(recipientAddress, transferAmount, ref);
      await eventPromise;
    });

    it('Fails to set fee recipient when sender is not owner', async () => {
      await tokenContract.deployed();

      await expect(
        tokenContract
          .connect(otherAddresses[1])
          .setFees(otherAddresses[2].address, 0, 0, 0),
      ).to.be.reverted;
    });

    /*
     * Gasless Transaction Tests
     */

    it('Should cover sender gas fees when submitting transferWithFee transaction to forwarder', async () => {
      await tokenContract.deployed();
      await forwarderContract.deployed();

      const chainId = 31337; // hardhat
      const sender = otherAddresses[1];
      const recipient = otherAddresses[2];
      const transferAmount = getTokenDecimalAmount(500);

      const mintAmount = getTokenDecimalAmount(1250);

      // mint sender some tokens to transfer
      await tokenContract.mint(sender.address, mintAmount);

      // create request object
      const gasEstimate = await tokenContract.connect(sender).estimateGas.transferWithFee(recipient.address, transferAmount);
      const callData = tokenContract.interface.encodeFunctionData('transferWithFee', [
        recipient.address,
        transferAmount,
      ]);

      const forwardRequest = {
        from: sender.address,
        to: tokenContract.address,
        value: getTokenDecimalAmount(0),
        gas: gasEstimate,
        nonce: getTokenDecimalAmount(1), // uint256
        data: callData,
      };

      // Sign message
      const domain = {
        chainId,
        name: 'ERC2771_Trusted_Forwarder',
        verifyingContract: forwarderContract.address,
        version: '1.0.0',
      };

      const types = {
        ForwardRequest: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'gas', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      };

      const signature = await sender._signTypedData(
        domain,
        types,
        forwardRequest,
      );

      // Execute forwarded transaction, check correct balances
      const externalAccount = owner;
      const externalAccountBalance = await externalAccount.getBalance() * 1;

      await forwarderContract.connect(externalAccount).execute(forwardRequest, signature);
      expect(await tokenContract.balanceOf(sender.address) * 1).to.equal(mintAmount * 1 - transferAmount * 1);
      expect(await tokenContract.balanceOf(recipient.address) * 1).to.equal(transferAmount * 1);

      if (externalAccountBalance - (await externalAccount.getBalance() * 1) <= 0) {
        throw new Error('Balance should of been reduced for gas.');
      }
    });

    it('Should properly revert from a call level revert of target contract', async () => {
      await tokenContract.deployed();
      await forwarderContract.deployed();

      const chainId = 31337; // hardhat
      const sender = otherAddresses[1];
      const recipient = otherAddresses[2];
      const transferAmount = getTokenDecimalAmount(500);

      const mintAmount = getTokenDecimalAmount(1250);

      // mint sender some tokens to transfer
      await tokenContract.mint(sender.address, mintAmount);

      // create request object
      const gasEstimate = await tokenContract.connect(sender).estimateGas.transferWithFee(recipient.address, transferAmount);
      const callData = tokenContract.interface.encodeFunctionData('transferWithFee', [
        recipient.address,
        transferAmount.mul(20),
      ]);

      const forwardRequest = {
        from: sender.address,
        to: tokenContract.address,
        value: getTokenDecimalAmount(0),
        gas: gasEstimate,
        nonce: getTokenDecimalAmount(1), // uint256
        data: callData,
      };

      // Sign message
      const domain = {
        chainId,
        name: 'ERC2771_Trusted_Forwarder',
        verifyingContract: forwarderContract.address,
        version: '1.0.0',
      };

      const types = {
        ForwardRequest: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'gas', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      };

      const signature = await sender._signTypedData(
        domain,
        types,
        forwardRequest,
      );

      // Execute forwarded transaction, check correct balances
      const externalAccount = owner;
      const externalAccountBalance = await externalAccount.getBalance() * 1;

      await expect(forwarderContract.connect(externalAccount).execute(forwardRequest, signature)).to.be.reverted;
    });

    it('Should cover sender gas fees when submitting transferWithFeeRef transaction to forwarder', async () => {
      await tokenContract.deployed();

      const chainId = 31337; // hardhat
      const sender = otherAddresses[1];
      const recipient = otherAddresses[2];
      const transferAmount = getTokenDecimalAmount(500);
      const ref = 1337;

      const mintAmount = getTokenDecimalAmount(1250);

      // mint sender some tokens to transfer
      await tokenContract.mint(sender.address, mintAmount);

      // create request object
      const gasEstimate = await tokenContract.connect(sender).estimateGas.transferWithFeeRef(recipient.address, transferAmount, ref);
      const callData = tokenContract.interface.encodeFunctionData('transferWithFeeRef', [
        recipient.address,
        transferAmount,
        ref,
      ]);

      const forwardRequest = {
        from: sender.address,
        to: tokenContract.address,
        value: getTokenDecimalAmount(0),
        gas: gasEstimate,
        nonce: getTokenDecimalAmount(2),
        data: callData,
      };

      // Sign message
      const domain = {
        chainId,
        name: 'ERC2771_Trusted_Forwarder',
        verifyingContract: forwarderContract.address,
        version: '1.0.0',
      };

      const types = {
        ForwardRequest: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'gas', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      };

      const signature = await sender._signTypedData(
        domain,
        types,
        forwardRequest,
      );

      // Execute forwarded transaction, check event, check correct balances
      const eventPromise = new Promise(resolve => {
        tokenContract.on('TransferRef', (_sender, _recipient, _amount, _ref) => {
          expect(sender.address).to.equal(_sender);
          expect(recipient.address).to.equal(_recipient);
          expect(_amount * 1).to.equal(transferAmount * 1);
          expect(_ref * 1).to.equal(ref * 1);
          resolve();
        });
      });

      const externalAccount = owner;
      const externalAccountBalance = await externalAccount.getBalance() * 1;

      await forwarderContract.connect(externalAccount).execute(forwardRequest, signature);

      await eventPromise;

      expect(await tokenContract.balanceOf(sender.address) * 1).to.equal(mintAmount * 1 - transferAmount * 1);
      expect(await tokenContract.balanceOf(recipient.address) * 1).to.equal(transferAmount * 1);

      if (externalAccountBalance - (await externalAccount.getBalance() * 1) <= 0) {
        throw new Error('Balance should of been reduced for gas.');
      }
    });

    it('Should allow multiple gasless transactions in the same block from the same address but with different nonces and fails when resubmitting transaction with prior known nonce', async () => {
      await tokenContract.deployed();

      const chainId = 31337; // hardhat
      const sender = otherAddresses[1];
      const recipient = otherAddresses[2];
      const recipientTwo = otherAddresses[3]
      const transferAmount = getTokenDecimalAmount(500);
      const ref = 1337;

      const mintAmount = getTokenDecimalAmount(1250);

      // mint sender some tokens to transfer
      await tokenContract.mint(sender.address, mintAmount);

      // create request objects one and two
      const gasEstimateOne = await tokenContract.connect(sender).estimateGas.transferWithFeeRef(recipient.address, transferAmount, ref);
      const callDataOne = tokenContract.interface.encodeFunctionData('transferWithFeeRef', [
        recipient.address,
        transferAmount,
        ref,
      ]);
      const forwardRequestOne = {
        from: sender.address,
        to: tokenContract.address,
        value: getTokenDecimalAmount(0),
        gas: gasEstimateOne,
        nonce: getTokenDecimalAmount(3),
        data: callDataOne,
      };

      const gasEstimateTwo = await tokenContract.connect(sender).estimateGas.transferWithFeeRef(recipientTwo.address, transferAmount, ref);
      const callDataTwo = tokenContract.interface.encodeFunctionData('transferWithFeeRef', [
        recipientTwo.address,
        transferAmount,
        ref,
      ]);
      const forwardRequestTwo = {
        from: sender.address,
        to: tokenContract.address,
        value: getTokenDecimalAmount(0),
        gas: gasEstimateTwo,
        nonce: getTokenDecimalAmount(4),
        data: callDataTwo,
      };

      // Sign messages one and two
      const domain = {
        chainId,
        name: 'ERC2771_Trusted_Forwarder',
        verifyingContract: forwarderContract.address,
        version: '1.0.0',
      };

      const types = {
        ForwardRequest: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'gas', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      };

      const signatureOne = await sender._signTypedData(domain, types, forwardRequestOne);
      const signatureTwo = await sender._signTypedData(domain, types, forwardRequestTwo);

      // execute requests one and two
      const externalAccount = owner;
      const externalAccountBalance = await externalAccount.getBalance() * 1;

      await Promise.all([
        forwarderContract.connect(externalAccount).execute(forwardRequestOne, signatureOne),
        forwarderContract.connect(externalAccount).execute(forwardRequestTwo, signatureTwo),
      ]);

      // attempt to re-execute request one, it should fail since the nonce is used
      await expect(
        forwarderContract.connect(externalAccount).execute(
          forwardRequestOne,
          signatureOne,
        )
      ).to.be.reverted;
    });

    it('Should allow gasless transactions signed by an approved delegate', async () => {
      const abiCoder = ethers.utils.defaultAbiCoder;
      const signer = otherAddresses[0];
      const sender = otherAddresses[1];
      const delegate = owner;
      const args = [ systemId, delegate.address, true, signer.address, BigNumber.from(53135) ];
      const hash = ethers.utils.keccak256(abiCoder.encode([ 'bytes32', 'address', 'bool', 'address', 'uint256' ], args));
      const approvalSignature = await signer.signMessage(ethers.utils.arrayify(hash));

      // set delegate, sender sets approval to prevent signer paying gas to approve.
      await systemDelegateApproverContract.connect(sender).setDelegateApprovalForSystemBySignature(...args, approvalSignature);

      // setup
      const chainId = 31337; // hardhat
      const recipient = otherAddresses[2];
      const transferAmount = getTokenDecimalAmount(500);
      const ref = 1337;

      const mintAmount = getTokenDecimalAmount(1250);

      // mint sender some tokens to transfer
      await tokenContract.mint(signer.address, mintAmount);

      // create request object
      const gasEstimate = await tokenContract.connect(signer).estimateGas.transferWithFeeRef(recipient.address, transferAmount, ref);
      const callData = tokenContract.interface.encodeFunctionData('transferWithFeeRef', [
        recipient.address,
        transferAmount,
        ref,
      ]);

      const forwardRequest = {
        from: signer.address,
        to: tokenContract.address,
        value: getTokenDecimalAmount(0),
        gas: gasEstimate,
        nonce: getTokenDecimalAmount(2),
        data: callData,
      };

      // Sign message
      const domain = {
        chainId,
        name: 'ERC2771_Trusted_Forwarder',
        verifyingContract: forwarderContract.address,
        version: '1.0.0',
      };

      const types = {
        ForwardRequest: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'gas', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      };

      const signature = await delegate._signTypedData(
        domain,
        types,
        forwardRequest,
      );

      const senderAccountBalance = await sender.getBalance() * 1;

      await forwarderContract.connect(sender).execute(forwardRequest, signature);

      expect(await tokenContract.balanceOf(signer.address) * 1).to.equal(mintAmount * 1 - transferAmount * 1);
      expect(await tokenContract.balanceOf(recipient.address) * 1).to.equal(transferAmount * 1);
    });

    it('Should properly upgrade trusted forwarder', async () => {
      await tokenContract.upgradeTrustedForwarder(otherAddresses[1].address);
      expect(await tokenContract.isTrustedForwarder(otherAddresses[1].address)).to.equal(true);
    });

    it('Fails to upgrade trusted forwarder if not owner', async () => {
      await expect(tokenContract.connect(otherAddresses[0]).upgradeTrustedForwarder(
        otherAddresses[1].address,
      )).to.be.reverted;
    });
});

/**
 * Helpers
 */

function getTokenDecimalAmount(amount) {
  return BigNumber.from(BigInt(amount * 1e18));
}
