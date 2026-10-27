const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying TokenSnapshots to ${hre.network.name} from ${deployer.address}...`);

  const TokenSnapshots = await hre.ethers.getContractFactory("TokenSnapshots");
  const contract = await TokenSnapshots.deploy();
  await contract.waitForDeployment();

  console.log(`TokenSnapshots deployed to: ${await contract.getAddress()}`);
  console.log("One shared contract with no owner and nothing to configure. Anyone can take a snapshot of any token.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
