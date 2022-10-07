const process = require('process');

// Throw errors if the env value is required.
const appenv = {
    get tenantSecret() {
        if (!process.env.EV_TENANT_SECRET)
            throw 'EV_TENANT_SECRET environment variable has not been set!';

        return process.env.EV_TENANT_SECRET;
    },
    get userPrivateKey() {
        if (!process.env.EV_USER_PRIVATE_KEY)
            throw 'EV_USER_PRIVATE_KEY environment variable has not been set!';

        return process.env.EV_USER_PRIVATE_KEY;
    },
    get hpConfigPath() {
        return process.env.EV_HP_CONFIG_PATH;
    },
    get contractConfigPath() {
        return process.env.EV_CONTRACT_CONFIG_PATH;
    }
}

Object.freeze(appenv);

module.exports = appenv