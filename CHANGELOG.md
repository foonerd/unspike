# Changelog

All notable changes to Unspike my CPU are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-15

The first release.

- **One unit, one variable.** On the 32-bit kernel of the Raspberry Pi 4, Pi 400 and Compute Module 4, before Volumio's services start, Unspike sets `UV_USE_IO_URING=0` for them, and the Node that Volumio runs on no longer keeps every core busy for minutes after a start.
- **Nothing of Volumio's is changed.** The variable goes into systemd's environment; no unit and no file of Volumio's is touched.
- **Kept to where it is needed.** The unit is skipped on every other kernel, and does nothing where the system already sets the variable itself.
- **A settings page that says what it found**: working, working from the next start, not needed because the system has its own fix, or not needed on this kernel; with the number of io_uring threads on the player.
- **Uninstalling takes it all back**, the variable included where the unit had set it.
- The settings page is in English, German, Spanish, French, Italian, Japanese, Dutch, Polish, Portuguese, Russian and Chinese.
