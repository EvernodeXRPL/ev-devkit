const evernode = require("evernode-js-client")
const uuid = require('uuid');
const { info } = require("./logger");

class EvernodeManager {
    #xrplApi;

    #registryAddress;

    #tenantSecret;

    #registryClient;
    #tenantClient;

    constructor(options = {}) {
        this.#registryAddress = options.registryAddress || 'r3cNR2bdao1NyvQ5ZuQvCUgqkoWGmgF34E';
        this.#tenantSecret = options.tenantSecret;
    }

    async init() {
        this.#xrplApi = new evernode.XrplApi('wss://hooks-testnet-v2.xrpl-labs.com');
        evernode.Defaults.set({
            registryAddress: this.#registryAddress,
            xrplApi: this.#xrplApi
        })
        await this.#xrplApi.connect();

        if (this.#tenantSecret) {
            this.#tenantClient = new evernode.TenantClient(null, this.#tenantSecret);
            this.#tenantClient.xrplAcc.address = this.#tenantClient.xrplAcc.wallet.classicAddress;
            await this.#tenantClient.connect();
        }

        this.#registryClient = new evernode.RegistryClient();
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

    async prepareTenant(requiredMoments) {
        await this.#tenantClient.prepareAccount();

        // Get the available EVR balance.
        let balance = await this.#tenantClient.getEVRBalance();
        // Request EVRs if we do not have enough.
        if (balance < this.#tenantClient.config.purchaserTargetPrice * requiredMoments) {
            info(`Not enough EVRs, Requesting funds`);
            // Create the trustline if not created.
            const lines = await this.#tenantClient.xrplAcc.getTrustLines(evernode.EvernodeConstants.EVR, this.#tenantClient.config.evrIssuerAddress);
            if (!lines || lines.length === 0)
                await this.#tenantClient.xrplAcc.setTrustLine(evernode.EvernodeConstants.EVR, this.#tenantClient.config.evrIssuerAddress, "99999999");

            // Send the EVR request transaction.
            await this.#tenantClient.xrplAcc.makePayment(this.#tenantClient.config.foundationAddress,
                evernode.XrplConstants.MIN_XRP_AMOUNT,
                evernode.XrplConstants.XRP,
                null,
                [{ type: 'giftBetaTenantEvr', format: '', data: '' }]);

            // Wait until the EVRs are received.
            let attempts = 0;
            while (attempts >= 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                balance = await this.#tenantClient.getEVRBalance();
                if (balance < 4) {
                    if (++attempts <= 20)
                        continue;
                    throw "EVR funds not received within timeout.";
                }
                break;
            }
        }
    }

    async getActiveHosts() {
        const hosts = await this.#registryClient.getActiveHosts();
        return hosts;
    }

    async getHostInfo(hostAddress) {
        const host = await this.#registryClient.getHostInfo(hostAddress);
        return host;
    }

    async acquire(moments, ownerPubkey, hostAddress = null, contractId = uuid.v4(), instanceImage = "hp.latest-ubt.20.04-njs.16", config = {}) {
        if (!this.#tenantClient)
            throw "Tenant account is not initialized.";

        await this.prepareTenant(moments);

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

        const result = await this.#tenantClient.acquireLease(hostAddress, requirement);
        const instanceName = result.instance.name;

        if (moments > 1 && instanceName) {
            const extendRes = await this.extend(hostAddress, instanceName, moments - 1);
            info(`Extending the instance for ${moments - 1} ${moments === 2 ? 'moment' : 'moments'}. Expiry moment: ${extendRes.expiryMoment}`);
        }

        return result.instance;
    }

    async extend(hostAddress, instanceName, moments) {
        if (!this.#tenantClient)
            throw "Tenant account is not initialized.";

        const result = await this.#tenantClient.extendLease(hostAddress, moments, instanceName);
        return result;
    }
}

module.exports = {
    EvernodeManager
};

