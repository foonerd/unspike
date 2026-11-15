# Unspike

A Volumio 4 plugin with one job: it stops a Raspberry Pi 4, Pi 400 or Compute Module 4 running flat out for minutes after every start.

On those boards, with the 32-bit kernel Volumio runs on them, the version of Node that Volumio is built on keeps every core of the processor busy for the first minutes after each start. The player is hot, slow to answer and slow to show its screens until it is over. Unspike has Volumio start without the cause of it.

It changes no file of Volumio's, it does nothing on any other player, and it steps aside by itself once Volumio carries its own fix.

## Is this my player?

It is if both of these are so:

- The kernel's name ends in `-v7l+`. That is the 32-bit kernel of the Raspberry Pi 4 family, and of no other board.

      uname -r

- Shortly after a start the player has io_uring threads, and its processor is busy with nothing playing.

      ps -eLo comm | grep -c '^iou-'      # a count well above 0
      uptime                              # a load average near or above 4

A Raspberry Pi 5, or a Raspberry Pi 4 on the 64-bit kernel (its name ends in `-v8+`), has the threads without the load, and has no use for this plugin.

## What it does

Unspike installs one systemd unit, `unspike.service`. At each start, before Volumio's own services start, the unit:

1. is skipped unless the kernel's name ends in `-v7l+`;
2. does nothing if `UV_USE_IO_URING` is already set, in systemd's environment or in Volumio's units: a system that says for itself how Node is to use io_uring is left to it;
3. otherwise sets `UV_USE_IO_URING=0` in systemd's environment.

Volumio's services, and everything they start, inherit that variable, and Node then does its file work the way it did before it took up io_uring. Nothing else is changed: no unit of Volumio's, no file of Volumio's, nothing in the boot configuration.

Because the unit runs when the player starts, the plugin works from the first start after it is switched on.

## What it changes

One Raspberry Pi 4 Model B (8 GB) with Volumio 4.245 on kernel `6.12.75-v7l+`, nothing playing, about two minutes after a start:

| | Without | With |
| --- | --- | --- |
| io_uring threads | 23 to 24 | 0 |
| Load average | 13 to 19 | about 2 |
| Processor time used by Volumio's Node processes | several minutes | about 40 s |
| Volumio's interface answers | 46 to 48 s after the kernel starts | about 39 s |
| Temperature | 75 °C | 67 °C |

Without it, the same player took up to a quarter of a minute to answer a request for its state in its second and third minute, and thirty milliseconds once the processor had calmed down.

## Installing

Install Unspike from Volumio's plugin store, under System Controller, switch it on, and restart the player once when it asks.

To install a release by hand, copy its zip to the player, unpack it into a folder of its own and run `volumio plugin install` there.

## The settings page

The page says what Unspike found on the player:

| It says | Which means |
| --- | --- |
| Working since this start | The unit set the variable at this start, and Volumio is running without io_uring. |
| Works from the next start | The plugin is on and the player has not restarted since. Restart it once. |
| The system itself already has Volumio start without io_uring | Volumio carries its own fix. Unspike does nothing, and can be uninstalled. |
| Does nothing here | The player's kernel is not the one Unspike is for. It can be uninstalled. |

*Look again* says the same for the moment it is pressed, with the number of io_uring threads on the player.

## Switching it off, and uninstalling

Switching the plugin off stops the unit running at the next start. Uninstalling removes the unit and the plugin's sudoers entry, and takes the variable back out of systemd's environment where the unit had set it. Either way the services that are running keep the way they started until the player restarts.

## Why it happens

Node 20 does its file work through io_uring, by way of the libuv it ships. On the 32-bit kernels of the Raspberry Pi 4 family that goes wrong: the kernel threads io_uring uses spin, and each Node process keeps a core busy with them. The reports upstream are [nodejs/node#49937](https://github.com/nodejs/node/issues/49937) and [libuv/libuv#4158](https://github.com/libuv/libuv/issues/4158). `UV_USE_IO_URING=0` is the switch libuv gives for doing without.

## What is where

    unspike/           the plugin: its unit, its Volumio side, its settings page, its installer
    test/              the plugin's tests, and the cases its installer is run through
    scripts/           check, package, release notes

## Building

    scripts/check.sh     shell lint, the installer run in a container, the plugin's files and languages, the tests
    scripts/package.sh   the plugin's zip, into dist/

The checks need Docker, for the container the installer is run in; Node 20 is used where it is installed and the `node:20-slim` container where it is not.

## Releases

The version is the one in `unspike/package.json`; `CHANGELOG.md` has a section for it and the `changelog` line of `package.json` starts with it.

    git tag v0.1.0 && git push origin v0.1.0

The tag runs the check, packages the plugin and publishes the zip with its SHA-256 as a pre-release, with that version's section of the changelog as the notes. It becomes the latest release once it has been tried on a player:

    gh release edit v0.1.0 --prerelease=false --latest

The release workflow can also be run by hand; it then builds everything and publishes nothing.

## Support this project

Unspike is free and open source, designed, built and maintained by one developer in his own time. If it has earned a place on your player, you can support its development:

- GitHub Sponsors: https://github.com/sponsors/foonerd
- Ko-fi: https://ko-fi.com/justanerd

## Licence

MIT.
