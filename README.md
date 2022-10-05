# Evernode developer kit
Evernode uses HotPocket as its smart contract engine. HotPocket smart contracts can be developed using any POSIX-compliant language/framework. To make it easy to develop and deploy HotPocket smart contracts on Evernode network, you can use Evernode developer kit.

## Installation

### Prerequisites
HotPocket developer kit requires you to install [NodeJs](https://nodejs.org/en/) on your development machine.

### Supports cross platform
This is a npm global package which supports both Linux and Windows
1. Install [prerequisites](#prerequisites).
2. Run the following command to install hpdevkit on your machine.
    ```
    npm i -g evdevkit
    ```

## Updates
Update `evdevkit` to the latest and update the supporting docker images.

Run one of following commands to update evdevkit.
    ```
    npm update -g evdevkit
    ```

## Uninstall
Uninstall `evdevkit` and the supporting docker images and containers.

- Using hpdevkit CLI
    ```
    npm uninstall -g evdevkit
    ```

_**NOTE:** In Linux platforms, for Installation, Update and Uninstallation you'll need root privileges. Add `sudo` to above commands._
