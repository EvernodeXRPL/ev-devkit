const uuid = require('uuid');
const path = require('path');
const { EvernodeManager } = require("./evernode-manager");
const { info, log, error } = require("./logger");
const appenv = require('../appenv');
const fs = require('fs');
const { generateKeys } = require("./common");

const CLUSTER_CHUNK_RATIO = 0.4;
const BLACKLIST_SCORE_THRESHOLD = 2;

class ClusterManager {
    #size;
    #tenantSecret;
    #ownerPrivateKey;
    #moments;
    #contractId;
    #instanceImage;
    #config;
    #hosts;
    #quorum;
    #signerCount;
    #signerMoments;
    multisig;

    #nodes;
    #evernodeMgr;
    #signers;

    constructor(options = {}) {
        this.#size = options.size || 3;
        this.#tenantSecret = options.tenantSecret;
        this.#ownerPrivateKey = options.ownerPrivateKey;
        this.#moments = options.moments || 1;
        this.#contractId = options.contractId || uuid.v4();
        this.#instanceImage = options.instanceImage || appenv.instanceImage;
        this.#config = options.config || {};
        this.multisig = options.multisig || false;

        if (this.multisig) {
            this.#signers = options.signers || [];
            this.#signerCount = this.#signers.length || options.signerCount || this.#size;
            // Required minimum accumulated weight for txn submission.
            // Quorum = quorum as a ratio * sum of weights
            this.#quorum = (this.#signers.length > 0)
                ? Math.ceil(options.quorum * (this.#signers.reduce(function (acc, s) { return acc + s.weight }, 0)))
                : Math.ceil(options.quorum * this.#signerCount); // Here we consider the signer weight as 1. Hence the sum of weight will be equal to `this.#size`.
            this.#signerMoments = options.signerMoments || this.#moments;
        }
    }

    async init() {
        if (!this.#tenantSecret)
            throw "Tenant secret is missing!";
        else if (!this.#ownerPrivateKey)
            throw "Owner private key is missing!";
        else if (!this.#instanceImage)
            throw "Instance image is missing!";

        this.#evernodeMgr = new EvernodeManager({
            tenantSecret: this.#tenantSecret
        });
        await this.#evernodeMgr.init();

        const hostList = (await this.#evernodeMgr.getActiveHosts()).filter(h => h.maxInstances > h.activeInstances).sort(() => Math.random() - 0.5);
        this.#hosts = hostList.reduce((map, host) => {
            host.blacklistScore = 0;
            map[host.address] = host;
            return map;
        }, {});

        this.#nodes = [];
    }

    async terminate() {
        if (this.#evernodeMgr)
            await this.#evernodeMgr.terminate();
    }

    async #createNode(hostAddress, ownerPubKey, config = {}, leaseOfferIndex = null, tenantSequence = null) {
        // Set consensus mode to public since primary node need to send proposals to others.
        if (!config.contract)
            config.contract = {};
        if (!config.contract.consensus)
            config.contract.consensus = {};
        config.contract.consensus.mode = "public";

        return await this.#evernodeMgr.acquire(
            1,
            ownerPubKey,
            hostAddress,
            this.#contractId,
            this.#instanceImage,
            config,
            { tenantSequence: tenantSequence, leaseOfferIndex: leaseOfferIndex });
    }

    async #extendCluster() {
        let tenantSequence = await this.#evernodeMgr.getTenantSequence();
        await Promise.all(this.#nodes.map(async (node, i) => {
            await new Promise(resolve => setTimeout(resolve, 500 * i));
            try {
                const life = (node.signer_detail ? (this.#signerMoments + i) : (this.#moments + i - this.#signerCount));
                if (life > 1) {
                    info(`Extending ${node.name} by ${life - 1} moments...`);
                    await this.#evernodeMgr.extend(node.host, node.name, life - 1, { tenantSequence: tenantSequence++ });
                }
                node.life_moments = life;
            }
            catch (e) {
                error(e.reason || e);
            }
        }));
    }

    async #createClusterChunk(chunkSize = 1, preferredHostsFilePath = null) {
        const nodes = [];
        const curNodeCount = this.#nodes.length;
        let tenantSequence = await this.#evernodeMgr.getTenantSequence();

        // Reading from file
        let preferedHostsArray = [];
        if (preferredHostsFilePath) {
            preferedHostsArray = this.getPreferredHostList(preferredHostsFilePath);
        }

        await Promise.all(Array(chunkSize).fill(0).map(async (v, i) => {
            await new Promise(resolve => setTimeout(resolve, 1000 * i));

            let hosts = [];
            let preferredHosts = [];

            hosts = Object.values(this.#hosts).filter((host) => host.blacklistScore < BLACKLIST_SCORE_THRESHOLD &&
                host.maxInstances > host.activeInstances);

            // Making preferred host list optional
            if (preferedHostsArray.length > 0) {
                preferredHosts = preferedHostsArray.map(ph => hosts.find(h => h.address === ph)).filter(h => h);
            }
            else {
                preferredHosts = hosts;
            }

            if (!preferredHosts || preferredHosts.length == 0)
                throw `All hosts are occupied.`;

            const host = preferredHosts[(curNodeCount + i) % preferredHosts.length];
            const nodeNumber = curNodeCount + i + 1;
            let nodeNumberText = nodeNumber;
            if (Math.floor(nodeNumber / 10) != 1 && nodeNumber % 10 === 1)
                nodeNumberText += 'st';
            else if (Math.floor(nodeNumber / 10) != 1 && nodeNumber % 10 === 2)
                nodeNumberText += 'nd';
            else if (Math.floor(nodeNumber / 10) != 1 && nodeNumber % 10 === 3)
                nodeNumberText += 'rd';
            else
                nodeNumberText += 'th';
            try {
                info(`Creating ${nodeNumberText} node on host ${host.address}...`);

                const hostLeases = await this.#evernodeMgr.getHostLeases(host.address);
                const selectedLeaseIndex = hostLeases && hostLeases[0] && hostLeases[0].index;
                if (!selectedLeaseIndex)
                    throw "No offers available.";

                let config = JSON.parse(JSON.stringify(this.#config));
                if (!config.mesh) config.mesh = {}

                const primaryNode = this.#nodes[0];
                if (this.#nodes.length > 0) {
                    // Here we set the primary node peer connection details to the reset of the nodes.

                    config.mesh.known_peers = [`${primaryNode.ip}:${primaryNode.peer_port}`];

                    // If the cluster does not require multi-sig feature, then we can allow other nodes to sync with primary node from the beginning.
                    if (!this.multisig) {
                        if (!config.contract) config.contract = {}
                        config.contract.unl = [primaryNode.pubkey];                        // // If cluster length is > MAX_MEMO_PEER_LIMIT pick MAX_MEMO_PEER_LIMIT random peers to limit the memo size.
                    }
                }

                let userKeys = await generateKeys(this.multisig ? null : this.#ownerPrivateKey, 'hex');

                const result = await this.#createNode(host.address, userKeys.publicKey, config, selectedLeaseIndex, tenantSequence++);

                info(`${nodeNumberText} node created! Name: ${result.name}`);
                nodes.push({ host: host.address, userKeys: userKeys, ...result });
                this.#hosts[host.address].activeInstances++;
            }
            catch (e) {
                log(`${nodeNumberText} node creation failed!`, e.reason || e);
                this.#hosts[host.address].blacklistScore++;
            }
        }));
        return nodes;
    }

    getPreferredHostList(preferredHostsFilePath) {
        // Reading from file
        let preferedHostsArray = [];
        try {
            // Read contents of the file
            const data = fs.readFileSync(preferredHostsFilePath, 'UTF-8')

            // Split the contents by new line
            const preferredHostListlines = data.split(/\r?\n/);

            // Assigning the hosts to the array
            preferredHostListlines.map((line, index) => {
                preferedHostsArray[index] = line;
            })

        } catch (err) {
            console.error(err)
        }
        return preferedHostsArray;
    }

    async createCluster(preferredHostsFilePath) {
        let targetSize = this.#size;
        const clusterChunkSize = Math.ceil(targetSize * CLUSTER_CHUNK_RATIO);

        while (targetSize > 0) {
            const nodes = await this.#createClusterChunk(targetSize == this.#size ? 1 : (clusterChunkSize < targetSize ? clusterChunkSize : targetSize), preferredHostsFilePath);
            this.#nodes.push(...nodes);
            targetSize -= nodes.length;
        }

        // Set the signers if the cluster requires multi-sig feature.
        if (this.multisig) {

            this.#signers = await this.#evernodeMgr.setSigners(this.#signers, this.#quorum, this.#signerCount);

            // Map the signers to nodes. (No any order)
            for (let i = 0; i < this.#signerCount; i++) {
                this.#nodes[i].signer_detail = this.#signers[i];
            }
        }

        if (this.#moments > 1 || this.#signerMoments > 1) {
            info(`Extending the nodes life...`);
            await this.#extendCluster();
        }

        return this.#nodes;
    }

    async writeSigner(destination, nodePubkey) {
        const normalizedPath = path.normalize(destination);
        const node = this.#nodes.find(n => n.pubkey === nodePubkey && n.hasOwnProperty('signer_detail'));
        if (node)
            fs.writeFileSync(normalizedPath, JSON.stringify(node.signer_detail, null, 4));
    }

    getTenantAddress() {
        return this.#evernodeMgr.getTenantAddress();
    }
}

module.exports = {
    ClusterManager
};

