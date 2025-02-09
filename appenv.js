const process = require('process');
const fs = require('fs');

const MAINNET = 'mainnet';

// Throw errors if the env value is required.
const appenv = {
    instanceImage: 'evernode/sashimono:hp.0.6.4-ubt.20.04-njs.20',
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
    get hpInitCfg() {
        if (process.env.EV_HP_INIT_CFG_PATH && !fs.existsSync(process.env.EV_HP_INIT_CFG_PATH))
            throw `HotPocket config file does not exist in EV_HP_INIT_CFG_PATH=${process.env.EV_HP_INIT_CFG_PATH}`;

        if (!process.env.EV_HP_INIT_CFG_PATH) {
            return {};
        }

        try {
            return JSON.parse(fs.readFileSync(process.env.EV_HP_INIT_CFG_PATH));
        }
        catch (e) {
            throw `EV_HP_INIT_CFG_PATH=${process.env.EV_HP_INIT_CFG_PATH} - ${e}`;
        }
    },
    get hpOverrideCfg() {
        if (process.env.EV_HP_OVERRIDE_CFG_PATH && !fs.existsSync(process.env.EV_HP_OVERRIDE_CFG_PATH))
            throw `HotPocket override config file does not exist in EV_HP_OVERRIDE_CFG_PATH=${process.env.EV_HP_OVERRIDE_CFG_PATH}`;

        if (!process.env.EV_HP_OVERRIDE_CFG_PATH) {
            return {};
        }

        try {
            return JSON.parse(fs.readFileSync(process.env.EV_HP_OVERRIDE_CFG_PATH));
        }
        catch (e) {
            throw `EV_HP_OVERRIDE_CFG_PATH=${process.env.EV_HP_OVERRIDE_CFG_PATH} - ${e}`;
        }
    },
    get network() {
        // TODO: Default will be changed to MAINNET after the launch.
        return process.env.EV_NETWORK || MAINNET;
    },
    get xahaudServer() {
        return process.env.EV_XAHAUD_SERVER || null;
    },
}

Object.freeze(appenv);

module.exports = appenv