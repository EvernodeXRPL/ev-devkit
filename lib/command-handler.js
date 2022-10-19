const fs = require('fs');
const path = require('path');
const appenv = require('../appenv');
const { exec } = require("./child-proc");
const { ClusterManager } = require('./cluster-manager');
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
    catch (e) {
        error('Error getting the version info:', e);
    }

    error(`\n${CONSTANTS.npmPackageName} is not installed.`);
}

async function list(options) {
    info(`command: list`);

    let evernodeMgr;
    try {
        evernodeMgr = new EvernodeManager();
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
    }
    catch (e) {
        error('Error occurred while getting the host list:', e);
    }
    finally {
        if (evernodeMgr)
            await evernodeMgr.terminate();
    }
}

async function host(hostAddress) {
    info(`command: info`);

    let evernodeMgr;
    try {
        evernodeMgr = new EvernodeManager();

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
    }
    catch (e) {
        error('Error occurred while getting the host info:', e);
    }
    finally {
        if (evernodeMgr)
            await evernodeMgr.terminate();
    }
}

async function keygen() {
    info(`command: keygen`);

    try {
        const keys = await generateKeys();
        success('New key pair generated', keys);
        info('Record these keys and set the private key to the environment variable called EV_USER_PRIVATE_KEY for future operations.');
    }
    catch (e) {
        error('Error occurred while generating key pair:', e);
    }
}

async function acquire(options) {
    info(`command: acquire`);

    let evernodeMgr;
    try {
        evernodeMgr = new EvernodeManager({
            tenantSecret: appenv.tenantSecret
        });

        await evernodeMgr.init();
        const userKeys = await generateKeys(appenv.userPrivateKey, 'hex');
        const result = await evernodeMgr.acquire(
            options.moments || 1,
            userKeys.publicKey,
            options.host,
            options.contractId,
            options.image,
            appenv.hpConfigPath ? JSON.parse(fs.readFileSync(appenv.hpConfigPath)) : {});
        success('Instance created!', result);
    }
    catch (e) {
        error('Error occurred while acquiring the instance:', e);
    }
    finally {
        if (evernodeMgr)
            await evernodeMgr.terminate();
    }
}

async function bundle(contractDirectoryPath, instancePublicKey, contractBin, options) {
    info(`command: bundle`);

    try {
        contractDirectoryPath = path.normalize(contractDirectoryPath);
        const stats = fs.existsSync(contractDirectoryPath) ? fs.statSync(contractDirectoryPath) : null;

        if (!stats || !stats.isDirectory())
            throw `Contract directory ${contractDirectoryPath} does not exists.`;

        const bundlePath = await bundleContract(
            contractDirectoryPath,
            [instancePublicKey],
            contractBin,
            options.contractArgs,
            appenv.contractConfigPath ? JSON.parse(fs.readFileSync(appenv.contractConfigPath)) : {});
        if (bundlePath)
            success(`Archive finished. (location: ${bundlePath})`);

    } catch (e) {
        error('Error occurred while bundling:', e);
    }

}

async function deploy(contractBundlePath, instanceIp, instanceUserPort) {
    info(`command: deploy`);

    let instanceMgr;
    try {
        instanceMgr = new InstanceManager({
            ip: instanceIp,
            userPort: instanceUserPort,
            userPrivateKey: appenv.userPrivateKey
        });

        await instanceMgr.init();
        await instanceMgr.uploadBundle(contractBundlePath);

        success(`Contract bundle uploaded!`);
    } catch (e) {
        error('Error occurred while uploading the bundle:', e);
    }
    finally {
        if (instanceMgr)
            await instanceMgr.terminate();
    }
}

async function acquireAndDeploy(contractDirectoryPath, contractBin, options) {
    info(`command: acquire-and-deploy`);

    let evernodeMgr;
    let instanceMgr;
    try {
        evernodeMgr = new EvernodeManager({
            tenantSecret: appenv.tenantSecret
        });

        contractDirectoryPath = path.normalize(contractDirectoryPath);
        const stats = fs.existsSync(contractDirectoryPath) ? fs.statSync(contractDirectoryPath) : null;

        if (!stats || !stats.isDirectory())
            throw `Contract directory ${contractDirectoryPath} does not exists.`;

        await evernodeMgr.init();

        const hpConfig = appenv.hpConfigPath ? JSON.parse(fs.readFileSync(appenv.hpConfigPath)) : {};
        const contractConfig = appenv.contractConfigPath ? JSON.parse(fs.readFileSync(appenv.contractConfigPath)) : {};

        const userKeys = await generateKeys(appenv.userPrivateKey, 'hex');
        const result = await evernodeMgr.acquire(
            options.moments || 1,
            userKeys.publicKey,
            options.host,
            options.contractId,
            options.image,
            hpConfig);
        const instancePublicKey = result.pubkey;
        const instanceIp = result.ip;
        const instanceUserPort = result.user_port;
        info('Instance created!', result);

        const bundlePath = await bundleContract(
            contractDirectoryPath,
            [instancePublicKey],
            contractBin,
            options.contractArgs,
            contractConfig);
        if (!bundlePath)
            throw 'Archive failed.';

        info(`Archive finished. (location: ${bundlePath})`);

        instanceMgr = new InstanceManager({
            ip: instanceIp,
            userPort: instanceUserPort,
            userPrivateKey: appenv.userPrivateKey
        });

        await instanceMgr.init();
        await instanceMgr.uploadBundle(bundlePath);

        info(`Contract bundle uploaded!`);
        success(`Contract deployed!`);
    }
    catch (e) {
        error('Error occurred while deploying:', e);
    }
    finally {
        if (evernodeMgr)
            await evernodeMgr.terminate();
        if (instanceMgr)
            await instanceMgr.terminate();
    }
}

async function clusterCreate(size, contractDirectoryPath, contractBin, options) {
    info(`command: create-cluster`);

    let clusterMgr;
    let instanceMgr;
    try {
        contractDirectoryPath = path.normalize(contractDirectoryPath);
        const stats = fs.existsSync(contractDirectoryPath) ? fs.statSync(contractDirectoryPath) : null;

        if (!stats || !stats.isDirectory())
            throw `Contract directory ${contractDirectoryPath} does not exists.`;

        const hpConfig = appenv.hpConfigPath ? JSON.parse(fs.readFileSync(appenv.hpConfigPath)) : {};
        const contractConfig = appenv.contractConfigPath ? JSON.parse(fs.readFileSync(appenv.contractConfigPath)) : {};

        const userKeys = await generateKeys(appenv.userPrivateKey, 'hex');

        clusterMgr = new ClusterManager({
            size: size,
            moments: options.moments,
            tenantSecret: appenv.tenantSecret,
            ownerPubKey: userKeys.publicKey,
            contractId: options.contractId,
            instanceImage: options.image,
            hpConfig
        });

        await clusterMgr.init();
        const result = await clusterMgr.createCluster();

        info(`Cluster created!`);

        const bundlePath = await bundleContract(
            contractDirectoryPath,
            result.map(i => i.pubkey),
            contractBin,
            options.contractArgs,
            contractConfig);
        if (!bundlePath)
            throw 'Archive failed.';

        info(`Archive finished. (location: ${bundlePath})`);

        instanceMgr = new InstanceManager({
            ip: result[0].ip,
            userPort: result[0].user_port,
            userPrivateKey: appenv.userPrivateKey
        });

        await instanceMgr.init();
        await instanceMgr.uploadBundle(bundlePath);

        info(`Contract bundle uploaded!`);
        success(`Created the ${result.length} node cluster!`, result);
    }
    catch (e) {
        error('Error occurred while creating the cluster:', e);
    }
    finally {
        if (clusterMgr)
            await clusterMgr.terminate();
        if (instanceMgr)
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
    deploy,
    acquireAndDeploy,
    clusterCreate
};