const Reset = "\x1b[0m";
const Bright = "\x1b[1m";
const Dim = "\x1b[2m";
const Underscore = "\x1b[4m";
const Blink = "\x1b[5m";
const Reverse = "\x1b[7m";
const Hidden = "\x1b[8m";

const FgBlack = "\x1b[30m";
const FgRed = "\x1b[31m";
const FgGreen = "\x1b[32m";
const FgYellow = "\x1b[33m";
const FgBlue = "\x1b[34m";
const FgMagenta = "\x1b[35m";
const FgCyan = "\x1b[36m";
const FgWhite = "\x1b[37m";

const BgBlack = "\x1b[40m";
const BgRed = "\x1b[41m";
const BgGreen = "\x1b[42m";
const BgYellow = "\x1b[43m";
const BgBlue = "\x1b[44m";
const BgMagenta = "\x1b[45m";
const BgCyan = "\x1b[46m";
const BgWhite = "\x1b[47m";

function success(...args) {
    process.argv.indexOf('--no-color') == -1 ? console.log(`${FgGreen}%s${Reset}`, ...args) : log(...args);    
}

function info(...args) {
    process.argv.indexOf('--no-color') == -1 ? console.log(`${FgBlue}%s${Reset}`, ...args) : log(...args);    
}

function warn(...args) {
    process.argv.indexOf('--no-color') == -1 ? console.log(`${FgYellow}%s${Reset}`, ...args) : log(...args);    
}

function error(...args) {
    process.argv.indexOf('--no-color') == -1 ? console.log(`${FgRed}%s${Reset}`, ...args) : log(...args);    
}

function log(...args) {
    console.log(...args);
}

module.exports = {
    success,
    info,
    warn,
    error,
    log
};