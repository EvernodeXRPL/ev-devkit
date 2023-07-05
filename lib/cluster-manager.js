const uuid = require('uuid');
const { EvernodeManager } = require("./evernode-manager");
const { info, log, error } = require("./logger");
const appenv = require('../appenv');
const fs = require('fs');

const MAX_MEMO_PEER_LIMIT = 10;
const CLUSTER_CHUNK_RATIO = 0.4;
const BLACKLIST_SCORE_THRESHOLD = 2;

class ClusterManager {
    #size;
    #tenantSecret;
    #ownerPubKey;
    #moments;
    #contractId;
    #instanceImage;
    #config;
    #hosts;

    #nodes;
    #evernodeMgr;

    constructor(options = {}) {
        this.#size = options.size || 3;
        this.#tenantSecret = options.tenantSecret;
        this.#ownerPubKey = options.ownerPubKey;
        this.#moments = options.moments || 1;
        this.#contractId = options.contractId || uuid.v4();
        this.#instanceImage = options.instanceImage || appenv.instanceImage;
        this.#config = options.config || {};
    }

    async init() {
        if (!this.#tenantSecret)
            throw "Tenant secret is missing!";
        else if (!this.#ownerPubKey)
            throw "Owner public key is missing!";
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

    async #createNode(hostAddress = null, config = {}, leaseOfferIndex = null, tenantSequence = null) {
        // Set consensus mode to public since primary node need to send proposals to others.
        if (!config.contract)
            config.contract = {};
        if (!config.contract.consensus)
            config.contract.consensus = {};
        config.contract.consensus.mode = "public";

        return await this.#evernodeMgr.acquire(
            1,
            this.#ownerPubKey,
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
            await this.#evernodeMgr.extend(node.host, node.name, this.#moments - 1, { tenantSequence: tenantSequence++ }).catch(e => { error(e.reason || e); })
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
                hosts.map((singleHost) => {
                    preferedHostsArray.map((preferedHost, i) => {
                        if (preferedHost == singleHost.address) {
                            preferredHosts[i] = singleHost;
                        }
                    })
                })
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

                if (this.#nodes.length > 0) {
                    if (!config.contract) config.contract = {}
                    config.contract.unl = [this.#nodes[0].pubkey];
                }

                if (!config.mesh) config.mesh = {}
                // If cluster length is > MAX_MEMO_PEER_LIMIT pick MAX_MEMO_PEER_LIMIT random peers to limit the memo size.
                config.mesh.known_peers = (this.#nodes.length > MAX_MEMO_PEER_LIMIT) ?
                    this.#nodes.sort(() => Math.random() - 0.5).slice(0, MAX_MEMO_PEER_LIMIT).map(n => `${n.ip}:${n.peer_port}`) :
                    this.#nodes.map(n => `${n.ip}:${n.peer_port}`);

                const result = await this.#createNode(host.address, config, selectedLeaseIndex, tenantSequence++);

                info(`${nodeNumberText} node created!`);
                nodes.push({ host: host.address, ...result });
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

        if (this.#moments > 1) {
            info(`Extending the nodes for ${this.#moments - 1}...`);
            await this.#extendCluster();
        }

        return this.#nodes;
    }
}

module.exports = {
    ClusterManager
};

