
const fs = require('fs');
const bson = require('bson');
const HotPocket = require('hotpocket-js-client');
const { info } = require('./logger');
const { generateKeys, keysToHex } = require('./common');

const DEFAULT_TIMEOUT = 60000;

class InstanceManager {
    #ip;
    #userPort;
    #userPrivateKey;
    #hpClient;

    constructor(options = {}) {
        this.#ip = options.ip;
        this.#userPort = options.userPort;
        this.#userPrivateKey = options.userPrivateKey;
    }

    async init() {
        if (!this.#ip || !this.#userPort || !this.#userPrivateKey)
            throw "Required parameters are missing!";

        const userKeys = await generateKeys(this.#userPrivateKey, 'binary');
        console.log('My public key is: ' + Buffer.from(userKeys.publicKey).toString('hex'));

        const server = `wss://${this.#ip}:${this.#userPort}`;
        this.#hpClient = await HotPocket.createClient([server], userKeys, {
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
            if (status)
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