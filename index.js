#! /usr/bin/env node

const { program, Argument } = require('commander');
const { version, list, acquire, host, bundle, keygen, deploy, acquireAndDeploy } = require('./lib/command-handler');

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
    .argument('<tenant-address>', 'Tenant XRPL account address')
    .argument('<tenant-secret>', 'Tenant XRPL account secret')
    .option('-h, --host [host]', 'Host to acquire')
    .option('-u, --user [user]', 'Public key of the user')
    .option('-m, --moments [moments]', 'Life moments')
    .option('-c, --contract-id [contract-id]', 'Contract id')
    .option('-i, --image [image]', 'Instance image')
    .action(acquire);

program
    .command('bundle')
    .description('Create contract bundle from contract')
    .argument('<contract-path>', 'Absolute path to the contract directory to be bundled')
    .argument('<instance-public-key>', 'Public key of the Evernode instance')
    .argument('<contract-bin>', 'Contract binary name')
    .argument('<contract-bin-args>', 'Contract binary arguments')
    .action(bundle);

program
    .command('deploy')
    .description('Deploy contract to a Evernode instance')
    .argument('<contract-bundle-path>', 'Absolute path to the contract bundle')
    .argument('<instance-ip>', 'IP address of the Evernode instance')
    .argument('<user-port>', 'User port of the instance')
    .argument('<user-private-key>', 'Private key of the user')
    .action(deploy);

program
    .command('acquire-and-deploy')
    .description('Acquire instance and deploy contract to a Evernode instance')
    .argument('<tenant-address>', 'Tenant XRPL account address')
    .argument('<tenant-secret>', 'Tenant XRPL account secret')
    .argument('<contract-path>', 'Absolute path to the contract directory to be bundled')
    .argument('<contract-bin>', 'Contract binary name')
    .argument('<contract-bin-args>', 'Contract binary arguments')
    .option('-h, --host [host]', 'Host to acquire')
    .option('-u, --user [user]', 'Private key of the user')
    .option('-m, --moments [moments]', 'Life moments')
    .option('-c, --contract-id [contract-id]', 'Contract id')
    .option('-i, --image [image]', 'Instance image')
    .action(acquireAndDeploy);

try {
    program.parse();
}
catch (e) {
    // Console outputs will be handled inside command functions.
    // Log the exception if not a console output.
    if (!('stdout' in e) && !('stderr' in e))
        console.error(e);
}