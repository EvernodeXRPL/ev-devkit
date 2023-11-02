const process = require('process');
const fs = require('fs');

// Throw errors if the env value is required.
const appenv = {
    instanceImage: 'evernodedev/sashimono:hp.0.6.4-ubt.20.04-njs.20',
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
    get hpInitCfgPath() {
        if (process.env.EV_HP_INIT_CFG_PATH && !fs.existsSync(process.env.EV_HP_INIT_CFG_PATH))
            throw `HotPocket config file does not exist in EV_HP_INIT_CFG_PATH=${process.env.EV_HP_INIT_CFG_PATH}`;

        return process.env.EV_HP_INIT_CFG_PATH;
    },
    get hpOverrideCfgPath() {
        if (process.env.EV_HP_OVERRIDE_CFG_PATH && !fs.existsSync(process.env.EV_HP_OVERRIDE_CFG_PATH))
            throw `HotPocket override config file does not exist in EV_HP_OVERRIDE_CFG_PATH=${process.env.EV_HP_OVERRIDE_CFG_PATH}`;

        return process.env.EV_HP_OVERRIDE_CFG_PATH;
    }
}

Object.freeze(appenv);

module.exports = appenv