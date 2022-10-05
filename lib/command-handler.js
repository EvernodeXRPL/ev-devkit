const fs = require('fs');
const path = require('path');
const { exec } = require("./child-proc");
const { CONSTANTS } = require("./common");
const { EvernodeManager } = require("./evernode-manager");
const { InstanceManager } = require('./instance-manager');
const { error, info, success, log } = require("./logger");
const { generateAndSaveKeyPair, generateKeyPair } = require("./hotpocket-helpers");

function version() {
    info(`command: version`);

    try {
        const res = exec(`npm -g list ${CONSTANTS.npmPackageName} --depth=0`);
        const splitted = res.toString().split('\n');
        if (splitted.length > 1) {
            success(`\n${splitted[1].split('@')[1]}\n`);
            return;
        }
    }
    catch (e) { }

    error(`\n${CONSTANTS.npmPackageName} is not installed.`);
}

async function list(options) {
    info(`command: list`);

    const evernodeMgr = new EvernodeManager();
    await evernodeMgr.init();
    const hosts = await evernodeMgr.getActiveHosts().catch(error);
    if (hosts) {
        log(hosts.slice(0, options.limit).map(h => {
            return {
                address: h.address,
                ip: h.description,
                ram: `${h.ramMb} MB`,
                storage: `${h.diskMb} MB`,
                cpu: {
                    model: h.cpuModelName,
                    time: `${h.cpuMicrosec} us`,
                    cores: h.cpuCount,
                    speed: `${h.cpuMHz} MHz`
                },
                sashimonoVersion: h.version,
                countryCode: h.countryCode,
                totalInstanceSlots: h.maxInstances,
                availableInstanceSlots: h.maxInstances - h.activeInstances
            }
        }));
    }
    await evernodeMgr.terminate();
}

async function host(hostAddress) {
    info(`command: info`);

    const evernodeMgr = new EvernodeManager();
    await evernodeMgr.init();
    const host = await evernodeMgr.getHostInfo(hostAddress).catch(error);
    if (host) {
        log({
            address: host.address,
            ip: host.description,
            ram: `${host.ramMb} MB`,
            storage: `${host.diskMb} MB`,
            cpu: {
                model: host.cpuModelName,
                time: `${host.cpuMicrosec} us`,
                cores: host.cpuCount,
                speed: `${host.cpuMHz} MHz`
            },
            sashimonoVersion: host.version,
            countryCode: host.countryCode,
            totalInstanceSlots: host.maxInstances,
            availableInstanceSlots: host.maxInstances - host.activeInstances,
            active: host.active
        }
        );
    }
    await evernodeMgr.terminate();
}

async function keygen() {
    info(`command: keygen`);

    try {
        const keyFilePath = path.normalize(path.resolve(CONSTANTS.keyFile));
        const keys = await generateAndSaveKeyPair(keyFilePath);
        success(`New key pair generated in ${keyFilePath}\n`, keys);
    }
    catch (e) {
        error('Error occurred while generating key pair:', e);
    }
}

async function acquire(tenantAddress, tenantSecret, options) {
    info(`command: acquire`);

    const evernodeMgr = new EvernodeManager({
        tenantAddress: tenantAddress,
        tenantSecret: tenantSecret
    });

    try {
        await evernodeMgr.init();

        const moments = options.moments || 1;
        await evernodeMgr.prepareTenant(moments);

        let hostAddress = options.host;
        if (!hostAddress) {
            const hosts = (await evernodeMgr.getActiveHosts()).filter(h => h.maxInstances - h.activeInstances > 0);
            hostAddress = hosts[Math.floor(Math.random() * hosts.length)].address;
            info('Picked random host', hostAddress);
        }
        let ownerPubkey = options.owner;
        if (!ownerPubkey) {
            const keyFilePath = path.normalize(path.resolve(CONSTANTS.keyFile));
            const keys = await generateAndSaveKeyPair(keyFilePath);
            info(`New key pair generated in ${keyFilePath}\n`, keys);
            ownerPubkey = keys.publicKey;
        }

        const result = await evernodeMgr.acquire(hostAddress, ownerPubkey, moments, options.contractId, options.image);
        success('Instance created!', result);
    }
    catch (e) {
        error('Error occurred while acquiring the instance:', e);
    }
    finally {
        await evernodeMgr.terminate();
    }
}

async function bundle(contractDirectoryPath, instancePublicKey, contractBin, contractBinArgs) {
    info(`command: bundle`);

    const instanceMgr = new InstanceManager({
        instancePubkey: instancePublicKey
    });

    try {
        contractDirectoryPath = path.normalize(contractDirectoryPath);
        let stats = fs.statSync(contractDirectoryPath);

        if (!stats.isDirectory())
            throw 'You are supposed to provide a path of the contract directory.';

        const bundlePath = await instanceMgr.bundleContract(contractDirectoryPath, contractBin, contractBinArgs);
        if (bundlePath)
            success(`Archive finished. (location: ${bundlePath})`);

    } catch (e) {
        error(e);
    }

}

async function deploy(contractBundlePath, instanceIp, instanceUserPort, userKeyFile) {
    info(`command: deploy`);

    const savedPrivateKeyHex = fs.readFileSync(userKeyFile).toString();
    const userKeyPair = await generateKeyPair(savedPrivateKeyHex);
    
    const instanceMgr = new InstanceManager({
        ip: instanceIp,
        userPort: instanceUserPort,
        userKeys: userKeyPair
    });

    try {
        await instanceMgr.init();
        await instanceMgr.uploadBundle(contractBundlePath);

        success(`Contract bundle uploaded!`);
    } catch (e) {
        error(e);
    }
    finally {
        await instanceMgr.terminate();
    }
}

module.exports = {
    version,
    list,
    host,
    keygen,
    acquire,
    bundle,
    deploy
};