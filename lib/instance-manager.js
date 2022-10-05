
const fs = require('fs');
const path = require('path');
const bson = require('bson');
const HotPocket = require('hotpocket-js-client');
const { CONSTANTS, archiveDirectory } = require('./common');
const { info } = require('./logger');

const DEFAULT_TIMEOUT = 60000;

class InstanceManager {
    #ip;
    #userPort;
    #instancePubkey;
    #userKeys;
    #hpClient;

    constructor(options = {}) {
        this.#ip = options.ip;
        this.#userPort = options.userPort;
        this.#instancePubkey = options.instancePubkey;
        this.#userKeys = options.userKeys;
    }

    async init() {
        if (!this.#ip || !this.#userPort || !this.#userKeys)
            throw "Required parameters are missing!";

        const pkhex = Buffer.from(this.#userKeys.publicKey).toString('hex');
        console.log('My public key is: ' + pkhex);

        const server = `wss://${this.#ip}:${this.#userPort}`;
        this.#hpClient = await HotPocket.createClient([server], this.#userKeys, {
            protocol: HotPocket.protocols.bson
        });

        // Establish HotPocket connection.
        if (!await this.#hpClient.connect())
            throw `${server} connection failed.`;
    }

    async terminate() {
        if (this.#hpClient)
            await this.#hpClient.close()
    }

    async bundleContract(contractDirectoryPath, contractBin, contractBinArgs, config = {}) {
        if (!this.#instancePubkey)
            throw "Instance public key is required.";

        const contractConfigPath = path.resolve(contractDirectoryPath, CONSTANTS.contractCfgFile);
        const prerequisiteInstaller = path.resolve(contractDirectoryPath, CONSTANTS.prerequisiteInstaller);

        let initConfig = {
            version: "2.0",
            unl: [this.#instancePubkey],
            bin_path: contractBin,
            bin_args: contractBinArgs,
            environment: "",
            max_input_ledger_offset: 10,
            consensus: {
                mode: "private",
                roundtime: 2000,
                stage_slice: 25,
                threshold: 50
            },
            npl: {
                mode: "private"
            },
            appbill: {
                mode: "",
                bin_args: ""
            },
            round_limits: {
                user_input_bytes: 0,
                user_output_bytes: 0,
                npl_output_bytes: 0,
                proc_cpu_seconds: 0,
                proc_mem_bytes: 0,
                proc_ofd_count: 0
            }
        }

        delete config.unl;
        delete config.bin_path;
        delete config.bin_args;

        // Write contract.config file content.
        fs.writeFileSync(contractConfigPath, JSON.stringify({ ...initConfig, ...config }, null, 4));
        info(`Prepared ${CONSTANTS.contractCfgFile} file.`);

        // Add prerequisite install script.
        fs.writeFileSync(prerequisiteInstaller,
            `#!/bin/bash\n` +
            `echo "Prerequisite installer script"\n` +
            `exit 0`, null);

        // Change permission  pre-requisite installer.
        fs.chmodSync(prerequisiteInstaller, 0o755);
        info("Added prerequisite installer script.");

        const bundleTargetPath = path.normalize(`${contractDirectoryPath}/../bundle`);

        if (!fs.existsSync(bundleTargetPath))
            fs.mkdirSync(bundleTargetPath);

        return archiveDirectory(contractDirectoryPath, bundleTargetPath);
    }

    async sendContractInput(input, timeoutMs = DEFAULT_TIMEOUT) {
        return new Promise(async (resolve, reject) => {

            const inputTimer = setTimeout(() => {
                clearTimeout(inputTimer);
                this.#hpClient.clear(HotPocket.events.contractOutput);
                reject("Input timeout.");
            }, timeoutMs);

            const failure = (e) => {
                clearTimeout(inputTimer);
                this.#hpClient.clear(HotPocket.events.contractOutput);
                reject(e);
            }
            const success = (result) => {
                clearTimeout(inputTimer);
                resolve(result);
            }

            // This will get fired when contract sends an output.
            this.#hpClient.on(HotPocket.events.contractOutput, (r) => {

                r.outputs.forEach(output => {
                    let result;
                    try {
                        result = bson.deserialize(output);
                    }
                    catch (e) {
                        failure(e);
                    }
                    if (result?.type == `${input.type}Result`) {
                        if (result.status == "ok")
                            success(result.message);
                        else
                            failure(`Input failed. reason: ${result.status}`);
                    }
                });
            });

            const res = await this.#hpClient.submitContractInput(bson.serialize(input));

            const submission = await res.submissionStatus;
            if (submission.status != "accepted")
                failure("Input submission failed. reason: " + submission.reason);
        });
    }

    async checkBootstrapStatus() {
        const res = await this.sendContractInput({
            type: "status"
        }, 10000);
        if (res)
            return res;
        else
            return null;
    }

    async uploadBundle(bundlePath) {
        try {
            const status = await this.checkBootstrapStatus();
            if (!status)
                info(status);
            else
                throw 'Status response is empty';
        }
        catch (e) {
            throw `Bootstrap contact is not available: ${e}`;
        }

        const fileContent = fs.readFileSync(bundlePath);
        const res = await this.sendContractInput({
            type: "upload",
            content: fileContent
        });

        return res;
    }
}

module.exports = {
    InstanceManager
}