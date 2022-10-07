const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const HotPocket = require('hotpocket-js-client');
const { info } = require('./logger');

const CONSTANTS = {
    npmPackageName: "evdevkit",
    contractCfgFile: "contract.config",
    prerequisiteInstaller: "install.sh"
};

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

async function bundleContract(contractDirectoryPath, instancePubkey, contractBin, contractBinArgs, config = {}) {
    const contractConfigPath = path.resolve(contractDirectoryPath, CONSTANTS.contractCfgFile);
    const prerequisiteInstaller = path.resolve(contractDirectoryPath, CONSTANTS.prerequisiteInstaller);

    config = {
        version: "2.0",
        environment: "",
        max_input_ledger_offset: 10,
        consensus: {
            mode: "private",
            roundtime: 2000,
            stage_slice: 25,
            threshold: 50
        },
        npl: {
            mode: "private"
        },
        appbill: {
            mode: "",
            bin_args: ""
        },
        round_limits: {
            user_input_bytes: 0,
            user_output_bytes: 0,
            npl_output_bytes: 0,
            proc_cpu_seconds: 0,
            proc_mem_bytes: 0,
            proc_ofd_count: 0
        },
        ...config,
        ...{
            unl: [instancePubkey],
            bin_path: contractBin,
            bin_args: contractBinArgs
        }
    }

    // Write contract.config file content.
    fs.writeFileSync(contractConfigPath, JSON.stringify(config, null, 4));
    info(`Prepared ${CONSTANTS.contractCfgFile} file.`);

    // Add prerequisite install script.
    fs.writeFileSync(prerequisiteInstaller,
        `#!/bin/bash\n` +
        `echo "Prerequisite installer script"\n` +
        `exit 0`, null);

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

module.exports = {
    CONSTANTS,
    bundleContract,
    generateKeys
};