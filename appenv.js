const process = require('process');
const fs = require('fs');

// Throw errors if the env value is required.
const appenv = {
    get tenantSecret() {
        if (!process.env.EV_TENANT_SECRET)
            throw 'EV_TENANT_SECRET environment variable has not been set.';

        return process.env.EV_TENANT_SECRET;
    },
    get userPrivateKey() {
        if (!process.env.EV_USER_PRIVATE_KEY)
            throw 'EV_USER_PRIVATE_KEY environment variable has not been set.';

        return process.env.EV_USER_PRIVATE_KEY;
    },
    get hpConfigPath() {
        if (process.env.EV_INSTANCE_CONFIG_PATH && !fs.existsSync(process.env.EV_INSTANCE_CONFIG_PATH))
            throw `HotPocket config file does not exist in EV_INSTANCE_CONFIG_PATH=${process.env.EV_INSTANCE_CONFIG_PATH}`;

        return process.env.EV_INSTANCE_CONFIG_PATH;
    },
    get contractConfigPath() {
        if (process.env.EV_CONTRACT_CONFIG_PATH && !fs.existsSync(process.env.EV_CONTRACT_CONFIG_PATH))
            throw `HotPocket smart contract config file does not exist in EV_CONTRACT_CONFIG_PATH=${process.env.EV_CONTRACT_CONFIG_PATH}`;

        return process.env.EV_CONTRACT_CONFIG_PATH;
    }
}

Object.freeze(appenv);

module.exports = appenv