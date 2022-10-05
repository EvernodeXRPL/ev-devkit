const fs = require('fs');
const HotPocket = require('hotpocket-js-client');

async function generateKeyPair(privateKeyHex = null) {
    return HotPocket.generateKeys(privateKeyHex);
}

async function generateAndSaveKeyPair(filePath) {
    const newKeyPair = await generateKeyPair();
    const saveData = Buffer.from(newKeyPair.privateKey).toString('hex');
    fs.writeFileSync(filePath, saveData);
    return {
        privateKey: Buffer.from(newKeyPair.privateKey).toString('hex'),
        publicKey: Buffer.from(newKeyPair.publicKey).toString('hex')
    };
}

module.exports = {
    generateKeyPair,
    generateAndSaveKeyPair
};