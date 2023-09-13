const evernode = require("evernode-js-client")
const uuid = require('uuid');
const { info } = require("./logger");
const { generateAccount } = require("./common");
const appenv = require("../appenv");

class EvernodeManager {
    #xrplApi;

    #governorAddress;

    #tenantSecret;

    #registryClient;
    #tenantClient;

    constructor(options = {}) {
        this.#governorAddress = options.governorAddress || 'rGVHr1PrfL93UAjyw3DWZoi9adz2sLp2yL';
        this.#tenantSecret = options.tenantSecret;
    }

    async init() {
        this.#xrplApi = new evernode.XrplApi('wss://hooks-testnet-v3.xrpl-labs.com');
        evernode.Defaults.set({
            governorAddress: this.#governorAddress,
            xrplApi: this.#xrplApi,
            networkID: 21338
        })
        await this.#xrplApi.connect();

        if (this.#tenantSecret) {
            this.#tenantClient = new evernode.TenantClient(null, this.#tenantSecret);
            this.#tenantClient.xrplAcc.address = this.#tenantClient.xrplAcc.wallet.classicAddress;
            await this.#tenantClient.connect();
            await this.#tenantClient.prepareAccount();
        }

        this.#registryClient = await evernode.HookClientFactory.create(evernode.HookTypes.registry);
        await this.#registryClient.connect();
    }

    async terminate() {
        if (this.#tenantClient)
            await this.#tenantClient.disconnect();
        if (this.#registryClient)
            await this.#registryClient.disconnect();
        if (this.#xrplApi)
            await this.#xrplApi.disconnect();
    }

    async getActiveHosts() {
        const hosts = await this.#registryClient.getActiveHosts();
        return hosts;
    }

    async getHostInfo(hostAddress) {
        const host = await this.#registryClient.getHostInfo(hostAddress);
        return host;
    }

    async getTenantSequence() {
        return await this.#tenantClient.xrplAcc.getSequence();
    }

    getTenantAddress() {
        return this.#tenantClient.xrplAcc.address;
    }

    async getHostLeases(hostAddress) {
        const hostClient = new evernode.HostClient(hostAddress);
        return await hostClient.getLeaseOffers();
    }

    async getEVRBalance() {
        const client = new evernode.TenantClient(this.getTenantAddress());
        await client.connect();
        const balance = await client.getEVRBalance();
        await client.disconnect();
        return balance;
    }

    async acquire(moments, ownerPubkey, hostAddress = null, contractId = uuid.v4(), instanceImage = appenv.instanceImage, config = {}, options = {}) {
        if (!this.#tenantClient)
            throw "Tenant account is not initialized.";

        if (!hostAddress) {
            const hosts = (await this.getActiveHosts()).filter(h => h.maxInstances - h.activeInstances > 0);
            hostAddress = hosts[Math.floor(Math.random() * hosts.length)].address;
            info('Picked random host', hostAddress);
        }

        let requirement = {
            owner_pubkey: ownerPubkey,
            contract_id: contractId,
            image: instanceImage,
            config: config
        };

        const result = await this.#tenantClient.acquireLease(hostAddress, requirement, { leaseOfferIndex: options.leaseIndex, transactionOptions: { sequence: options.tenantSequence } });
        const acquiredTimestamp = Date.now();
        const instanceName = result.instance.name;

        if (moments > 1 && instanceName) {
            const extendRes = await this.extend(hostAddress, instanceName, moments - 1);
            info(`Extending the instance for ${moments - 1} ${moments === 2 ? 'moment' : 'moments'}. Expiry moment: ${extendRes.expiryMoment}`);
        }

        return { ...result.instance, created_timestamp: acquiredTimestamp };
    }

    async extend(hostAddress, instanceName, moments, options = {}) {
        if (!this.#tenantClient)
            throw "Tenant account is not initialized.";

        const result = await this.#tenantClient.extendLease(hostAddress, moments, instanceName, { transactionOptions: { sequence: options.tenantSequence } });
        return result;
    }

    async setSigners(signers, quorum, size, options = {}) {
        if (!this.#tenantClient)
            throw "Tenant account is not initialized.";

        if (signers.length == 0)
            for (let i = 0; i < size; i++) {
                const acc = generateAccount();
                signers.push({ ...acc, weight: 1 });
            }

        if (signers.length < 1)
            throw ("Signer list is empty.")

        if (quorum < 1)
            throw ("Signer quorum must be a positive integer.");


        await this.#tenantClient.xrplAcc.setSignerList(signers.map((n) => { return { account: n.account, weight: n.weight } }), { signerQuorum: quorum }, options);
        return signers;

    }
}

module.exports = {
    EvernodeManager
};

