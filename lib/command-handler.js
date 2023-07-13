const fs = require('fs');
const path = require('path');
const appenv = require('../appenv');
const { exec } = require("./child-proc");
const { ClusterManager } = require('./cluster-manager');
const { CONSTANTS, bundleContract, generateKeys, validateArrayElements, removeDirectorySync } = require("./common");
const { EvernodeManager } = require("./evernode-manager");
const { InstanceManager } = require('./instance-manager');
const { error, info, success, log } = require("./logger");

const NODES_BUNDLE_PATH = `./nodes/`;
const DEFAULT_QUORUM = 0.8;

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
                    ip: h.domain,
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
                ip: host.domain,
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

async function extendInstance(hostAddress, instanceName, options) {
    info(`command: extend`);

    let evernodeMgr;
    try {
        evernodeMgr = new EvernodeManager({
            tenantSecret: appenv.tenantSecret
        });

        await evernodeMgr.init();

        const result = await evernodeMgr.extend(hostAddress, instanceName, options.moments);
        success('Extended!', result);
    }
    catch (e) {
        error('Error occurred while extending the instance:.', e);
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
            throw `Contract directory ${contractDirectoryPath} does not exist.`;

        if (options?.filePath && !fs.existsSync(options.filePath))
            throw 'Preferred Host file path does not exist.';

        if (options?.signers && !fs.existsSync(options.signers))
            throw 'Signer Details file path does not exist.';

        const hpConfig = appenv.hpConfigPath ? JSON.parse(fs.readFileSync(appenv.hpConfigPath)) : {};
        const contractConfig = appenv.contractConfigPath ? JSON.parse(fs.readFileSync(appenv.contractConfigPath)) : {};

        const userKeys = await generateKeys(appenv.userPrivateKey, 'hex');

        const clusterSpec = {
            size: size,
            moments: options.moments,
            tenantSecret: appenv.tenantSecret,
            ownerPubKey: userKeys.publicKey,
            contractId: options.contractId,
            instanceImage: options.image,
            config: hpConfig,
        }

        // If the user wants to make a multi-sig enabled cluster
        if (options?.multisig) {
            clusterSpec.multisig = true
            if (options?.signers) {
                options.signers = JSON.parse(fs.readFileSync(options.signers));
                if (options.signers.length === Number(size) && validateArrayElements(options.signers, ['account', 'secret', 'weight']))
                    clusterSpec.signers = options?.signers;
                else {
                    throw 'Invalid Signer list';
                }
            }

            // Here we consider quorum as a ratio from total weights.
            if (options?.quorum) {
                if (options.quorum > 0 && options.quorum <= 1)
                    clusterSpec.quorum = options.quorum;
                else
                    throw 'Invalid Quorum';
            }
            else
                clusterSpec.quorum = DEFAULT_QUORUM;
        }

        clusterMgr = new ClusterManager(clusterSpec);

        await clusterMgr.init();
        const result = await clusterMgr.createCluster(options.filePath);

        instanceMgr = new InstanceManager({
            ip: result[0].ip,
            userPort: result[0].user_port,
            userPrivateKey: appenv.userPrivateKey
        });

        await instanceMgr.init();

        if (clusterMgr.multisig) {
            const primaryNode = result[0];

            // Regular expression pattern to match the placeholder
            const placeholderPattern = /<MASTER_ADDRESS>/g;

            // Post Installation Script template with placeholders.
            const postInstallScriptTemplate = `
#!/bin/bash
# Post install script.

# Check if <MASTER_ADDRESS>.key file exists and move it to outer level.
if [[ -f ./<MASTER_ADDRESS>.key ]]; then
    mv ./<MASTER_ADDRESS>.key ../<MASTER_ADDRESS>.key
    echo "Moved <MASTER_ADDRESS>.key file in the outer level."
fi

exit 1
` // exit 1 => Purposely making a bootstrap upgrade failure.

            const tenantMasterAddress = clusterMgr.getTenantAddress();

            // Prepare the post installation script.
            let postInstallScript = postInstallScriptTemplate.replace(placeholderPattern, tenantMasterAddress);

            const primaryNodeBundlePath = path.resolve(`${NODES_BUNDLE_PATH}${primaryNode.pubkey}/contract_path/`);
            fs.mkdirSync(primaryNodeBundlePath, { recursive: true });

            // NOTE : Here we upload a dummy contract. But this won't override the bootstrap contract as we are making a forceful bootstrap upgrade failure.
            // Write an empty JavaScript file
            fs.writeFileSync(`${primaryNodeBundlePath}/index.js`, `console.log("Partial Contract");`);

            // Create an empty JSON file
            fs.writeFileSync(`${primaryNodeBundlePath}/contract.config`, JSON.stringify({}));

            await clusterMgr.writeSigner(`${primaryNodeBundlePath}/${tenantMasterAddress}.key`, primaryNode.pubkey);
            const initBundlePath = await bundleContract(primaryNodeBundlePath, [primaryNode.pubkey], '/usr/bin/node', 'index.js', undefined, postInstallScript);
            await instanceMgr.uploadBundle(initBundlePath, true);

            // Replace "exit 1" with "exit 0" in order to remove forceful bootstrap upgrade failure.
            postInstallScript = postInstallScript.replace(/exit 1\b/g, 'exit 0');

            // Upload a bundle with making UNL as primary node.
            await Promise.all(
                result.map(async (node) => {
                    if (node.pubkey === primaryNode.pubkey) return;

                    const nodeBundlePath = path.resolve(`${NODES_BUNDLE_PATH}${node.pubkey}/contract_path/`);
                    fs.mkdirSync(nodeBundlePath, { recursive: true });

                    const secondaryInstanceMgr = new InstanceManager({
                        ip: node.ip,
                        userPort: node.user_port,
                        userPrivateKey: appenv.userPrivateKey
                    });

                    await secondaryInstanceMgr.init();

                    await clusterMgr.writeSigner(`${nodeBundlePath}/${tenantMasterAddress}.key`, node.pubkey);
                    const secondaryBundlePath = await bundleContract(nodeBundlePath, [primaryNode.pubkey], 'bootstrap_contract', userKeys.publicKey, undefined, postInstallScript);
                    await secondaryInstanceMgr.uploadBundle(secondaryBundlePath);

                    await secondaryInstanceMgr.terminate();
                })
            );

            const clusterFileContent = result.map((n) => {
                return {
                    refId: n.acquire_ref_id,
                    contractId: n.contract_id,
                    createdOnLcl: 0,
                    host: n.host,
                    ip: n.ip,
                    name: n.name,
                    peerPort: parseInt(n.peer_port),
                    pubkey: n.pubkey,
                    userPort: parseInt(n.user_port),
                    isUnl: true,
                    isQuorum: true,
                    lifeMoments: options?.moments ? options?.moments : 1,
                    targetLifeMoments: options?.moments ? options?.moments : 1,
                    createdMoment: n.created_moment,
                    signerWeight: n.signerDetail.weight
                }
            });

            // Write the relevant files regarding to multi-sig enabling.
            const clusterFilePath = path.resolve(`${contractDirectoryPath}/cluster.json`);
            fs.writeFileSync(clusterFilePath, JSON.stringify({ nodes: clusterFileContent, pendingNodes: [] }, null, 4));

            const multiSigFlagPath = path.resolve(`${contractDirectoryPath}/multisig`);
            fs.writeFileSync(multiSigFlagPath, "MULTISIG");
        }

        info(`Cluster created!`);

        console.log('Waiting 15 seconds until nodes are synced...');
        await new Promise(resolve => {
            setTimeout(() => {
                resolve();
            }, 15000);
        });

        // Upload the requested contract to the created cluster.
        const bundlePath = await bundleContract(
            contractDirectoryPath,
            result.map(i => i.pubkey),
            contractBin,
            options.contractArgs,
            contractConfig);
        if (!bundlePath)
            throw 'Archive failed.';

        info(`Archive finished. (location: ${bundlePath})`);


        await instanceMgr.uploadBundle(bundlePath);

        info(`Contract bundle uploaded!`);
        success(`Created the ${result.length} node cluster!`, result);
    }
    catch (e) {
        error('Error occurred while creating the cluster:', e);
    }
    finally {
        // Remove the directories of supported bundles.
        removeDirectorySync(NODES_BUNDLE_PATH);

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
    clusterCreate,
    extendInstance
};