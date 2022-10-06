const fs = require('fs');
const path = require('path');
const { exec } = require("./child-proc");
const { CONSTANTS, bundleContract, generateKeys } = require("./common");
const { EvernodeManager } = require("./evernode-manager");
const { InstanceManager } = require('./instance-manager');
const { error, info, success, log } = require("./logger");

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
        const keys = await generateKeys();
        success('New key pair generated', keys);
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

        const result = await evernodeMgr.acquire(options.moments || 1, options.host, options.user, options.contractId, options.image);
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

    try {
        contractDirectoryPath = path.normalize(contractDirectoryPath);
        const stats = fs.existsSync(contractDirectoryPath) ? fs.statSync(contractDirectoryPath) : null;

        if (!stats || !stats.isDirectory())
            throw `Contract directory ${contractDirectoryPath} does not exists.`;

        const bundlePath = await bundleContract(contractDirectoryPath, instancePublicKey, contractBin, contractBinArgs);
        if (bundlePath)
            success(`Archive finished. (location: ${bundlePath})`);

    } catch (e) {
        error('Error occurred while bundling:', e);
    }

}

async function deploy(contractBundlePath, instanceIp, instanceUserPort, userPrivateKey) {
    info(`command: deploy`);

    const instanceMgr = new InstanceManager({
        ip: instanceIp,
        userPort: instanceUserPort,
        userPrivateKey: userPrivateKey
    });

    try {
        await instanceMgr.init();
        await instanceMgr.uploadBundle(contractBundlePath);

        success(`Contract bundle uploaded!`);
    } catch (e) {
        error('Error occurred while uploading the bundle:', e);
    }
    finally {
        await instanceMgr.terminate();
    }
}

async function acquireAndDeploy(tenantAddress, tenantSecret, contractDirectoryPath, contractBin, contractBinArgs, options) {
    info(`command: acquire-and-deploy`);

    const evernodeMgr = new EvernodeManager({
        tenantAddress: tenantAddress,
        tenantSecret: tenantSecret
    });

    try {
        contractDirectoryPath = path.normalize(contractDirectoryPath);
        const stats = fs.existsSync(contractDirectoryPath) ? fs.statSync(contractDirectoryPath) : null;

        if (!stats || !stats.isDirectory())
            throw `Contract directory ${contractDirectoryPath} does not exists.`;

        await evernodeMgr.init();

        const result = await evernodeMgr.acquire(options.moments || 1, options.host, options.user, options.contractId, options.image);
        const instancePublicKey = result.pubkey;
        const instanceIp = result.ip;
        const instanceUserPort = result.user_port;
        const userPrivateKey = options.user || result.user_secret;
        info('Instance created!', result);

        const bundlePath = await bundleContract(contractDirectoryPath, instancePublicKey, contractBin, contractBinArgs);
        if (!bundlePath)
            throw 'Archive failed.';

        info(`Archive finished. (location: ${bundlePath})`);

        const instanceMgr = new InstanceManager({
            ip: instanceIp,
            userPort: instanceUserPort,
            userPrivateKey: userPrivateKey
        });

        try {
            await instanceMgr.init();
            await instanceMgr.uploadBundle(bundlePath);

            info(`Contract bundle uploaded!`);
            success(`Contract deployed!`);
        } catch (e) {
            throw e;
        }
        finally {
            await instanceMgr.terminate();
        }
    }
    catch (e) {
        error('Error occurred while deploying:', e);
    }
    finally {
        await evernodeMgr.terminate();
    }
}

module.exports = {
    version,
    list,
    host,
    keygen,
    acquire,
    bundle,
    deploy,
    acquireAndDeploy
};