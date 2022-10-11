// SPDX-License-Identifier: Commons-Clause-1.0
//  __  __     _        ___     _
// |  \/  |___| |_ __ _| __|_ _| |__
// | |\/| / -_)  _/ _` | _/ _` | '_ \
// |_|  |_\___|\__\__,_|_|\__,_|_.__/
//
// Launch your crypto game or gamefi project's blockchain
// infrastructure & game APIs fast with https://trymetafab.com

pragma solidity ^0.8.16;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "./IERC1155_Game_Items.sol";
import "../common/ERC2771Context_Upgradeable.sol";
import "../common/Roles.sol";

contract ERC1155_Game_Items is IERC1155_Game_Items, ERC1155, ERC2771Context_Upgradeable, Roles, AccessControl {
  uint256[] public itemIds;
  mapping(uint256 => uint256) public itemSupplies; // itemId => minted item supply
  mapping(uint256 => uint256) public itemTransferTimelocks; // itemId => timestamp.
  mapping(uint256 => string) private itemURIs; // itemId => complete metadata uri

  constructor(address _forwarder)
  ERC1155("")
  ERC2771Context_Upgradeable(_forwarder) {
    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _setupRole(OWNER_ROLE, _msgSender());
  }

  function uri(uint256 _itemId) public view override returns (string memory) {
    return itemURIs[_itemId];
  }

  function setItemURI(uint256 _itemId, string memory _uri) external onlyRole(OWNER_ROLE) {
    itemURIs[_itemId] = _uri;
  }

  function bulkSetItemURIs(uint256[] calldata _itemIds, string[] memory _uris) external onlyRole(OWNER_ROLE) {
    for (uint256 i = 0; i < _itemIds.length; i++) {
      itemURIs[_itemIds[i]] = _uris[i];
    }
  }

  function itemExists(uint256 _itemId) external view returns (bool) {
    return itemSupplies[_itemId] > 0;
  }

  function isItemTransferrable(uint256 _itemId) public view returns (bool) {
    return itemTransferTimelocks[_itemId] < block.timestamp;
  }

  function setItemTransferTimelock(uint256 _itemId, uint256 _unlockTimestamp) external onlyRole(OWNER_ROLE) {
    itemTransferTimelocks[_itemId] = _unlockTimestamp;
  }

  function mintToAddress(address _toAddress, uint256 _itemId, uint256 _quantity) external canMint {
    _mint(_toAddress, _itemId, _quantity, "");
  }

  function mintBatchToAddress(address _toAddress, uint256[] calldata _itemIds, uint256[] calldata _quantities) external canMint {
    _mintBatch(_toAddress, _itemIds, _quantities, "");
  }

  function burnFromAddress(address _fromAddress, uint256 _itemId, uint256 _quantity) external canBurn(_fromAddress) {
    _burn(_fromAddress, _itemId, _quantity);
  }

  function burnBatchFromAddress(address _fromAddress, uint256[] calldata _itemIds, uint256[] calldata _quantities) external canBurn(_fromAddress) {
    _burnBatch(_fromAddress, _itemIds, _quantities);
  }

  function bulkSafeTransferFrom(address _fromAddress, address[] calldata _toAddresses, uint256 _itemId, uint256 _quantityPerAddress) external {
    for (uint256 i = 0; i < _toAddresses.length; i++) {
      safeTransferFrom(_fromAddress, _toAddresses[i], _itemId, _quantityPerAddress, "");
    }
  }

  function bulkSafeBatchTransferFrom(address _fromAddress, address[] calldata _toAddresses, uint256[] calldata _itemIds, uint256[] calldata _quantitiesPerAddress) external {
    for (uint256 i = 0; i < _toAddresses.length; i++) {
      safeBatchTransferFrom(_fromAddress, _toAddresses[i], _itemIds, _quantitiesPerAddress, "");
    }
  }

  /**
   * @dev Pagination
   */

  function totalItemIds() external view returns(uint256) {
    return itemIds.length;
  }

  function allItemIds() external view returns (uint256[] memory) {
    return itemIds;
  }

  function allItemSupplies() external view returns (uint256[] memory) {
    uint256[] memory supplies = new uint256[](itemIds.length);

    for (uint256 i = 0; i < itemIds.length; i++) {
      supplies[i] = itemSupplies[itemIds[i]];
    }

    return supplies;
  }

  function allItemURIs() external view returns (string[] memory) {
    string[] memory uris = new string[](itemIds.length);

    for (uint256 i = 0; i < itemIds.length; i++) {
      uris[i] = itemURIs[itemIds[i]];
    }

    return uris;
  }

  function paginateItemIds(uint256 _itemIdsStartIndexInclusive, uint256 _limit) external view returns (uint256[] memory) {
    uint256 totalPaginatable = _itemIdsStartIndexInclusive < itemIds.length ? itemIds.length - _itemIdsStartIndexInclusive : 0;
    uint256 totalPaginate = totalPaginatable <= _limit ? totalPaginatable : _limit;
    uint256[] memory ids = new uint256[](totalPaginate);

    for (uint256 i = 0; i < totalPaginate; i++) {
      ids[i] = itemIds[_itemIdsStartIndexInclusive + i];
    }

    return ids;
  }

  function paginateItemSupplies(uint256 _itemIdsStartIndexInclusive, uint256 _limit) external view returns (uint256[] memory) {
    uint256 totalPaginatable = _itemIdsStartIndexInclusive < itemIds.length ? itemIds.length - _itemIdsStartIndexInclusive : 0;
    uint256 totalPaginate = totalPaginatable <= _limit ? totalPaginatable : _limit;
    uint256[] memory supplies = new uint256[](totalPaginate);

    for (uint256 i = 0; i < totalPaginate; i++) {
      supplies[i] = itemSupplies[itemIds[_itemIdsStartIndexInclusive + i]];
    }

    return supplies;
  }

  function paginateItemURIs(uint256 _itemIdsStartIndexInclusive, uint256 _limit) external view returns (string[] memory) {
    uint256 totalPaginatable = _itemIdsStartIndexInclusive < itemIds.length ? itemIds.length - _itemIdsStartIndexInclusive : 0;
    uint256 totalPaginate = totalPaginatable <= _limit ? totalPaginatable : _limit;
    string[] memory uris = new string[](totalPaginate);

    for (uint256 i = 0; i < totalPaginate; i++) {
      uris[i] = itemURIs[itemIds[_itemIdsStartIndexInclusive + i]];
    }

    return uris;
  }

  /**
   * @dev Support for gasless transactions
   */

  function upgradeTrustedForwarder(address _newTrustedForwarder) external onlyRole(OWNER_ROLE) {
    _upgradeTrustedForwarder(_newTrustedForwarder);
  }

  function _msgSender() internal view override(Context, ERC2771Context_Upgradeable) returns (address) {
    return super._msgSender();
  }

  function _msgData() internal view override(Context, ERC2771Context_Upgradeable) returns (bytes calldata) {
    return super._msgData();
  }

  /**
   * @dev Support for non-transferable items.
   */

  function _beforeTokenTransfer(
    address operator,
    address from,
    address to,
    uint256[] memory ids,
    uint256[] memory amounts,
    bytes memory data
  ) internal virtual override {
    super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

    for (uint256 i = 0; i < ids.length; i++) {
      uint256 id = ids[i];

      require(
        (
          isItemTransferrable(id) ||
          from == address(0) || // allow mint
          hasRole(OWNER_ROLE, from) || // allow owner transfers
          hasRole(MINTER_ROLE, from) || // allow minter transfers
          to == address(0) // allow burn
        ),
        "Item is not currently transferable."
      );

      if (from == address(0)) {
        if (itemSupplies[id] == 0) { // new item
          itemIds.push(id);
        }

        itemSupplies[id] += amounts[i];
      }

      if (to == address(0)) {
        require(itemSupplies[id] >= amounts[i], "ERC1155: burn amount exceeds itemSupply");

        itemSupplies[id] = itemSupplies[id] - amounts[i];
      }
    }
  }

  /**
   * @dev ERC165
   */

  function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, IERC165, AccessControl) returns (bool) {
    return interfaceId == type(IERC1155_Game_Items).interfaceId || super.supportsInterface(interfaceId);
  }

  /**
   * @dev Modifiers
   */

  modifier canMint {
    require(hasRole(OWNER_ROLE, _msgSender()) || hasRole(MINTER_ROLE, _msgSender()), "Not authorized to mint.");
    _;
  }

  modifier canBurn(address _fromAddress) {
    require(_fromAddress == _msgSender() || isApprovedForAll(_fromAddress, _msgSender()), "Not approved to burn.");
    _;
  }
}
