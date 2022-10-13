const uuid = require('uuid');
const { EvernodeManager } = require("./evernode-manager");
const { info, log } = require("./logger");

const MAX_MEMO_PEER_LIMIT = 10;
const CLUSTER_CHUNK_RATIO = 0.2;
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
        this.#instanceImage = options.instanceImage || "hp.latest-ubt.20.04-njs.16";
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

    async #createNode(hostAddress = null, config = {}) {
        return await this.#evernodeMgr.acquire(
            this.#moments,
            this.#ownerPubKey,
            hostAddress,
            this.#contractId,
            this.#instanceImage,
            config);
    }

    async #createClusterChunk(chunkSize = 1) {
        const nodes = [];
        const curNodeCount = this.#nodes.length;
        await Promise.all(Array(chunkSize).fill(0).map(async (v, i) => {
            await new Promise(resolve => setTimeout(resolve, 1000 * i));

            const hosts = Object.values(this.#hosts).filter(host => host.blacklistScore < BLACKLIST_SCORE_THRESHOLD &&
                host.maxInstances > host.activeInstances);

            if (!hosts || hosts.length == 0)
                throw `All hosts are occupied.`;

            const nodeIdx = curNodeCount + i
            const host = hosts[nodeIdx % hosts.length];
            try {
                info(`Creating node ${nodeIdx + 1} on host ${host.address}...`);

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

                const result = await this.#createNode(host.address, config);

                info(`Node ${nodeIdx + 1} created!`);
                nodes.push(result);
                this.#hosts[host.address].activeInstances++;
            }
            catch (e) {
                log(`Node ${nodeIdx + 1} creation failed!`, e.reason || e);
                this.#hosts[host.address].blacklistScore++;
            }
        }));
        return nodes;
    }

    async createCluster() {
        await this.#evernodeMgr.prepareTenant(this.#moments * this.#size);

        let targetSize = this.#size;
        const clusterChunkSize = Math.ceil(targetSize * CLUSTER_CHUNK_RATIO);

        while (targetSize > 0) {
            const nodes = await this.#createClusterChunk(targetSize == this.#size ? 1 : (clusterChunkSize < targetSize ? clusterChunkSize : targetSize));
            this.#nodes.push(...nodes);
            targetSize -= nodes.length;
        }

        return this.#nodes;
    }
}

module.exports = {
    ClusterManager
};

