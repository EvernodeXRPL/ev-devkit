const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const HotPocket = require('hotpocket-js-client');
const { info, error, log } = require('./logger');
const kp = require('ripple-keypairs');
const readline = require('readline');

const CONSTANTS = {
    npmPackageName: "evdevkit",
    contractCfgFile: "contract.config",
    prerequisiteInstaller: "install.sh",
    hpCfgOverrideFile: "hp.cfg.override",
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

async function bundleContract(contractDirectoryPath, hpOverrideCfg, prerequisite = PREREQ_SCRIPT_CONTENT) {
    const hpCfgOverridePath = path.resolve(contractDirectoryPath, CONSTANTS.hpCfgOverrideFile);
    const prerequisiteInstaller = path.resolve(contractDirectoryPath, CONSTANTS.prerequisiteInstaller);

    let backupTmpDir;
    let backupHpCfgOverridePath;
    let backupPrerequisiteInstaller;

    // Create temp directory to keep backups.
    if (fs.existsSync(hpCfgOverridePath) || fs.existsSync(prerequisiteInstaller))
        backupTmpDir = fs.mkdtempSync("sashi-bundle-");

    if (fs.existsSync(hpCfgOverridePath)) {
        backupHpCfgOverridePath = path.resolve(backupTmpDir, `${CONSTANTS.hpCfgOverrideFile}_backup`);
        fs.renameSync(hpCfgOverridePath, backupHpCfgOverridePath);
        log(`Existing ${CONSTANTS.hpCfgOverrideFile} backed up at ${backupHpCfgOverridePath}`);
    }
    if (fs.existsSync(prerequisiteInstaller)) {
        backupPrerequisiteInstaller = path.resolve(backupTmpDir, `${CONSTANTS.prerequisiteInstaller}_backup`);
        fs.renameSync(prerequisiteInstaller, backupPrerequisiteInstaller);
        log(`Existing ${CONSTANTS.prerequisiteInstaller} backed up at ${backupPrerequisiteInstaller}`);
    }

    // Write hp.cfg.override file content.
    fs.writeFileSync(hpCfgOverridePath, JSON.stringify(hpOverrideCfg, null, 4));
    info(`Prepared ${CONSTANTS.hpCfgOverrideFile} file.`);

    // Add prerequisite install script.
    fs.writeFileSync(prerequisiteInstaller, prerequisite, null);

    // Change permission  pre-requisite installer.
    fs.chmodSync(prerequisiteInstaller, 0o755);
    info("Added prerequisite installer script.");

    const bundleTargetPath = path.normalize(`${contractDirectoryPath}/../bundle`);

    if (!fs.existsSync(bundleTargetPath))
        fs.mkdirSync(bundleTargetPath);

    const bundlePath = await archiveDirectory(contractDirectoryPath, bundleTargetPath);

    if (backupHpCfgOverridePath && fs.existsSync(backupHpCfgOverridePath)) {
        fs.rmSync(hpCfgOverridePath);
        fs.renameSync(backupHpCfgOverridePath, hpCfgOverridePath);
        log(`Backup restored at ${hpCfgOverridePath}`);
    }
    if (backupPrerequisiteInstaller && fs.existsSync(backupPrerequisiteInstaller)) {
        fs.rmSync(prerequisiteInstaller);
        fs.renameSync(backupPrerequisiteInstaller, prerequisiteInstaller);
        log(`Backup restored at ${prerequisiteInstaller}`);
    }
    if (backupTmpDir && fs.existsSync(backupTmpDir))
        fs.rmdirSync(backupTmpDir);

    return bundlePath;
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
    questionSync
};