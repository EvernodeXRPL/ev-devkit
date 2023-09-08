const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const HotPocket = require('hotpocket-js-client');
const { info, error } = require('./logger');
const kp = require('ripple-keypairs');
const readline = require('readline');

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
                // Field validation failed
                return false;
            }
        }
    }
    // All elements passed field validation
    return true;
}

function removeDirectorySync(directory) {
    if (fs.existsSync(directory)) {
        // Remove the directory
        fs.rmSync(directory, { recursive: true });
    }
}

function copyDirectorySync(sourceDir, destinationDir) {
    try {
        if (!fs.existsSync(destinationDir)) {
            fs.mkdirSync(destinationDir, { recursive: true });
        }

        const files = fs.readdirSync(sourceDir);

        for (const file of files) {
            const currentSource = `${sourceDir}/${file}`;
            const currentDestination = `${destinationDir}/${file}`;

            // Check if the current item is a directory
            if (fs.statSync(currentSource).isDirectory()) {
                // Recursively copy the subdirectory
                copyDirectorySync(currentSource, currentDestination);
            } else {
                fs.copyFileSync(currentSource, currentDestination);
            }
        }

        info('Directory contents copied successfully.');
    } catch (err) {
        error('Error copying directory:', err);
    }
}

function formatTime(time) {
    const days = Math.floor(time / (3600 * 24));
    const hours = Math.floor(time % (3600 * 24) / 3600);
    const minutes = Math.floor(time % 3600 / 60);
    const seconds = Math.floor(time % 60);
    let timeDisplay = [];
    if (days > 0)
        timeDisplay.push(`${days} Days`);
    if (hours > 0)
        timeDisplay.push(`${hours} Hours`);
    if (minutes > 0 && days == 0)
        timeDisplay.push(`${minutes} min`);
    if (seconds > 0 && hours == 0)
        timeDisplay.push(`${seconds} s`);

    return timeDisplay.join(", ");
}

function questionSync(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

module.exports = {
    CONSTANTS,
    bundleContract,
    generateKeys,
    generateAccount,
    validateArrayElements,
    removeDirectorySync,
    copyDirectorySync,
    formatTime,
    questionSync
};