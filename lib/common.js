const fs = require('fs');
const archiver = require('archiver');

const CONSTANTS = {
    npmPackageName: `evdevkit`,
    contractCfgFile: "contract.config",
    prerequisiteInstaller: "install.sh",
    keyFile: "user.key"
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

module.exports = {
    CONSTANTS,
    archiveDirectory
};