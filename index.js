#! /usr/bin/env node

const { program } = require('commander');
const { version, list, acquire, host, bundle, keygen, deploy, acquireAndDeploy, clusterCreate } = require('./lib/command-handler');

const ENV_TEXT = 'Environment Variables:';
const REQUIRED_TEXT = 'Required:';
const OPTIONAL_TEXT = 'Optional:';
const TENANT_SECRET_TEXT = 'EV_TENANT_SECRET               Tenant XRPL account secret';
const USER_PRIVATE_KEY_TEXT = 'EV_USER_PRIVATE_KEY            Private key of the contract client (Can be generated using "evdevkit keygen")';
const INSTANCE_CONFIG_PATH_TEXT = 'EV_INSTANCE_CONFIG_PATH        Path of the locally created HotPocket instance configuration file';
const CONTRACT_CONFIG_PATH_TEXT = 'EV_CONTRACT_CONFIG_PATH        Path of the locally created HotPocket contract configuration file';

program
    .command('version')
    .description('See evdevkit version')
    .action(version);

program
    .command('list')
    .description('List active hosts in Evernode.')
    .option('-l, --limit [limit]', 'List limit')
    .action(list);

program
    .command('host')
    .description('View host info')
    .argument('<host-address>', 'Host XRPL account address')
    .action(host);

program
    .command('keygen')
    .description('Generate user key pair for HotPocket')
    .action(keygen);

program
    .command('acquire')
    .description('Acquire instance in Evernode')
    .addHelpText('afterAll', `\n${ENV_TEXT}`)
    .addHelpText('afterAll', `  ${REQUIRED_TEXT}
    ${TENANT_SECRET_TEXT}
    ${USER_PRIVATE_KEY_TEXT}`)
    .addHelpText('afterAll', `  ${OPTIONAL_TEXT}
    ${INSTANCE_CONFIG_PATH_TEXT}`)
    .option('-h, --host [host]', 'Host to acquire')
    .option('-m, --moments [moments]', 'Life moments')
    .option('-c, --contract-id [contract-id]', 'Contract id')
    .option('-i, --image [image]', 'Instance image')
    .action(acquire);

program
    .command('bundle')
    .description('Create contract bundle from contract')
    .addHelpText('afterAll', `\n${ENV_TEXT}`)
    .addHelpText('afterAll', `  ${OPTIONAL_TEXT}
    ${CONTRACT_CONFIG_PATH_TEXT}`)
    .argument('<contract-path>', 'Absolute path to the contract directory to be bundled')
    .argument('<instance-public-key>', 'Public key of the Evernode instance')
    .argument('<contract-bin>', 'Contract binary name')
    .option('-a, --contract-args [contract-args]', 'Contract binary arguments')
    .action(bundle);

program
    .command('deploy')
    .description('Deploy contract to a Evernode instance')
    .addHelpText('afterAll', `\n${ENV_TEXT}`)
    .addHelpText('afterAll', `  ${REQUIRED_TEXT}
    ${USER_PRIVATE_KEY_TEXT}`)
    .argument('<contract-bundle-path>', 'Absolute path to the contract bundle')
    .argument('<instance-ip>', 'IP address of the Evernode instance')
    .argument('<user-port>', 'User port of the instance')
    .action(deploy);

program
    .command('acquire-and-deploy')
    .description('Acquire instance and deploy contract to a Evernode instance')
    .addHelpText('afterAll', `\n${ENV_TEXT}`)
    .addHelpText('afterAll', `  ${REQUIRED_TEXT}
    ${TENANT_SECRET_TEXT}
    ${USER_PRIVATE_KEY_TEXT}`)
    .addHelpText('afterAll', `  ${OPTIONAL_TEXT}
    ${INSTANCE_CONFIG_PATH_TEXT}
    ${CONTRACT_CONFIG_PATH_TEXT}`)
    .argument('<contract-path>', 'Absolute path to the contract directory to be bundled')
    .argument('<contract-bin>', 'Contract binary name')
    .option('-a, --contract-args [contract-args]', 'Contract binary arguments')
    .option('-h, --host [host]', 'Host to acquire')
    .option('-m, --moments [moments]', 'Life moments')
    .option('-c, --contract-id [contract-id]', 'Contract id')
    .option('-i, --image [image]', 'Instance image')
    .action(acquireAndDeploy);

program
    .command('cluster-create')
    .description('Acquire instance cluster and deploy contract')
    .addHelpText('afterAll', `\n${ENV_TEXT}`)
    .addHelpText('afterAll', `  ${REQUIRED_TEXT}
    ${TENANT_SECRET_TEXT}
    ${USER_PRIVATE_KEY_TEXT}`)
    .addHelpText('afterAll', `  ${OPTIONAL_TEXT}
    ${INSTANCE_CONFIG_PATH_TEXT}
    ${CONTRACT_CONFIG_PATH_TEXT}`)
    .argument('<size>', 'Size of the cluster')
    .argument('<contract-path>', 'Absolute path to the contract directory to be bundled')
    .argument('<contract-bin>', 'Contract binary name')
    .option('-a, --contract-args [contract-args]', 'Contract binary arguments')
    .option('-m, --moments [moments]', 'Life moments')
    .option('-c, --contract-id [contract-id]', 'Contract id')
    .option('-i, --image [image]', 'Instance image')
    .option('-f, --file-path [file-path]', 'File path of preferred host account list (in line-by-line format)')
    .action(clusterCreate);

try {
    program.parse();
}
catch (e) {
    // Console outputs will be handled inside command functions.
    // Log the exception if not a console output.
    if (!('stdout' in e) && !('stderr' in e))
        console.error(e);
}