const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const HotPocket = require('hotpocket-js-client');
const { info } = require('./logger');
const kp = require('ripple-keypairs');


const CONSTANTS = {
    npmPackageName: "evdevkit",
    contractCfgFile: "contract.config",
    prerequisiteInstaller: "install.sh"
};

const PREREQ_SCRIPT_CONTENT = `#!/bin/bash\n` +
    `echo "Prerequisite installer script"\n` +
    `exit 0`

async function archiveDirectory(sourcePath, destinationPath = null) {
    return new Promise((resolve, reject) => {
        if (!sourcePath)
            reject("Invalid path was provided.");

        // Create a file to stream archive data to
        const target = (destinationPath) ? `${destinationPath}/bundle.zip` : `${sourcePath}/bundle.zip`
        const output = fs.createWriteStream(target);
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        // Callbacks
        output.on('close', () => {
            resolve(target);
        });

        archive.on('error', (err) => {
            reject(err);
        });

        // Pipe and append files
        archive.pipe(output);
        archive.directory(sourcePath, false);

        // Finalize
        archive.finalize();
    });
}

async function bundleContract(contractDirectoryPath, unl, contractBin, contractArgs = "", config = {}, prerequisite = PREREQ_SCRIPT_CONTENT) {
    const contractConfigPath = path.resolve(contractDirectoryPath, CONSTANTS.contractCfgFile);
    const prerequisiteInstaller = path.resolve(contractDirectoryPath, CONSTANTS.prerequisiteInstaller);

    config = {
        ...config,
        ...{
            unl: unl,
            bin_path: contractBin,
            bin_args: contractArgs
        }
    }

    // Write contract.config file content.
    fs.writeFileSync(contractConfigPath, JSON.stringify(config, null, 4));
    info(`Prepared ${CONSTANTS.contractCfgFile} file.`);

    // Add prerequisite install script.
    fs.writeFileSync(prerequisiteInstaller, prerequisite, null);

    // Change permission  pre-requisite installer.
    fs.chmodSync(prerequisiteInstaller, 0o755);
    info("Added prerequisite installer script.");

    const bundleTargetPath = path.normalize(`${contractDirectoryPath}/../bundle`);

    if (!fs.existsSync(bundleTargetPath))
        fs.mkdirSync(bundleTargetPath);

    return archiveDirectory(contractDirectoryPath, bundleTargetPath);
}

async function generateKeys(privateKey = null, format = 'hex') {
    const keys = await HotPocket.generateKeys(privateKey);
    return format === 'hex' ? {
        privateKey: Buffer.from(keys.privateKey).toString('hex'),
        publicKey: Buffer.from(keys.publicKey).toString('hex')
    } : keys;
}

function generateAccount() {
    const nodeSecret = kp.generateSeed({ algorithm: "ecdsa-secp256k1" });
    const keypair = kp.deriveKeypair(nodeSecret);
    return {
        account: kp.deriveAddress(keypair.publicKey),
        secret: nodeSecret
    };
}

function validateArrayElements(array, fields) {
    for (const element of array) {
        // Perform field validation for each element
        for (const field of fields) {
            if (!element.hasOwnProperty(field)) {
                return false; // Field validation failed
            }
        }
    }
    return true; // All elements passed field validation
}

function removeDirectorySync(directory) {
    if (fs.existsSync(directory)) {
        // Remove the directory
        fs.rmSync(directory, { recursive: true });
    }
}

function copyDirectorySync(sourceDir, destinationDir) {
    try {
        // Create the destination directory if it doesn't exist
        if (!fs.existsSync(destinationDir)) {
            fs.mkdirSync(destinationDir, { recursive: true });
        }

        // Get the contents of the source directory
        const files = fs.readdirSync(sourceDir);

        // Copy each file or directory to the destination directory
        for (const file of files) {
            const currentSource = `${sourceDir}/${file}`;
            const currentDestination = `${destinationDir}/${file}`;

            // Check if the current item is a directory
            if (fs.statSync(currentSource).isDirectory()) {
                copyDirectorySync(currentSource, currentDestination); // Recursively copy the subdirectory
            } else {
                fs.copyFileSync(currentSource, currentDestination); // Copy the file
            }
        }

        console.log('Directory contents copied successfully.');
    } catch (err) {
        console.error('Error copying directory:', err);
    }
}



module.exports = {
    CONSTANTS,
    bundleContract,
    generateKeys,
    generateAccount,
    validateArrayElements,
    removeDirectorySync,
    copyDirectorySync
};