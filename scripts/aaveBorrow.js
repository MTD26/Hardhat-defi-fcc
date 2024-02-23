const { getNamedAccounts, ethers } = require("hardhat")
const { getWeth, AMOUNT } = require("../scripts/getWeth")
const { networkConfig } = require("../helper-hardhat-config")

const BORROW_MODE = 2 // Variable borrow mode. Stable was disabled.

async function main() {
    // the aave protocol treats everything as an ERC20 Token (its much easier)
    await getWeth()
    const { deployer } = await getNamedAccounts()

    const lendingPool = await getLendingPool()
    console.log(`Lending pool address ${lendingPool.address}`)

    // Deposit (We have to first approve to be able to deposit. Its all done below)
    const wethtokenAddress = networkConfig[network.config.chainId].wethToken
    await approveErc20(wethtokenAddress, lendingPool.address, AMOUNT, deployer)
    console.log("----------------- Depositing ---------------------")
    await lendingPool.deposit(wethtokenAddress, AMOUNT, deployer, 0)
    console.log("------------------ Deposited ---------------------")

    let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(lendingPool, deployer)
    const daiPrice = await getDaiPrice()
    const amountDaiToBorrow = availableBorrowsETH.toString() * 0.95 * (1 / daiPrice.toNumber())
    console.log(`You can borrow ${amountDaiToBorrow} DAI`)

    const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString())
    // Borrowing (After depositing)
    const daiTokenAddress = networkConfig[network.config.chainId].daiToken

    await borrowDai(daiTokenAddress, lendingPool, amountDaiToBorrowWei, deployer)
    // How much we have borrowed , how much we have in collateral and how much we can borrow
    await getBorrowUserData(lendingPool, deployer)
    await repay(amountDaiToBorrowWei, daiTokenAddress, lendingPool, deployer)
    await getBorrowUserData(lendingPool, deployer)
}

async function repay(amount, daiAddress, lendingPool, account) {
    await approveErc20(daiAddress, lendingPool.address, amount, account)
    console.log("the error is not on top of gerer")
    const repayTx = await lendingPool.repay(daiAddress, amount, BORROW_MODE, account)
    await repayTx.wait(1)
    console.log("--------------- Repaid --------------------")
}

async function borrowDai(daiAddress, lendingPool, amountDaiToBorrow, account) {
    const borrowTx = await lendingPool.borrow(
        daiAddress,
        amountDaiToBorrow,
        BORROW_MODE,
        0,
        account
    )
    await borrowTx.wait(1)
    console.log("-------------------------You've borrowed-----------------------")
}

async function getDaiPrice() {
    const daiEthPricefeed = await ethers.getContractAt(
        "AggregatorV3Interface",
        "0x773616E4d11A78F511299002da57A0a94577F1f4"
    )
    const price = (await daiEthPricefeed.latestRoundData())[1]
    console.log(`The DAI / ETH price is ${price.toString()}`)
    return price
}
async function getBorrowUserData(lendingPool, account) {
    // We are getting the following data from the lendingPool contract by ccalling the getUserAccountData() function in that contract
    const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
        await lendingPool.getUserAccountData(account)
    console.log(`--> You have ${totalCollateralETH} ETH of collateral`)
    console.log(`--> You have ${totalDebtETH} ETH of Debt`)
    console.log(`--> You have ${availableBorrowsETH} ETH available to borrow`)
    return { availableBorrowsETH, totalDebtETH }
}

async function getLendingPool(account) {
    const lendingPoolAddressesProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        networkConfig[network.config.chainId].lendingPoolAddressesProvider,
        account
    )
    // the line below is getting and address
    const lendingPoolAddress = await lendingPoolAddressesProvider.getLendingPool()
    //the line below is returning a contract interface
    const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account)
    return lendingPool
}

async function approveErc20(erc20Address, spenderAddress, amountToSpend, account) {
    const erc20Token = await ethers.getContractAt("IERC20", erc20Address, account)
    const tx = await erc20Token.approve(spenderAddress, amountToSpend)
    await tx.wait(1)
    console.log("------------------ Approved ---------------------")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
