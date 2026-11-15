#!/bin/sh
# The installer and the uninstaller, run as root in a container laid out
# like a player. See scripts/installers.sh.
set -eu

PLUGIN=/data/plugins/system_controller/unspike
PLUGINS=/data/configuration/plugins.json
CALLS=/tmp/calls
UNIT=/etc/systemd/system/unspike.service
SUDOERS=/etc/sudoers.d/volumio-user-unspike
MARK=/tmp/unspike.set

# What the scripts ask of the system is written down, not done.
mkdir -p /usr/local/sbin
for tool in systemctl visudo; do
  printf '#!/bin/sh\necho "%s $*" >> %s\n' "$tool" "$CALLS" > "/usr/local/sbin/$tool"
  chmod +x "/usr/local/sbin/$tool"
done
useradd -m volumio
export UNSPIKE_MARK="$MARK"

fail() {
  echo "FAILED: $*" >&2
  echo "--- calls" >&2
  cat "$CALLS" >&2 2>/dev/null || true
  exit 1
}

# A player with the plugin's files unpacked and nothing installed yet.
player() {
  rm -rf /data "$CALLS" "$UNIT" "$SUDOERS" "$MARK"
  mkdir -p "$PLUGIN" /data/configuration /etc/systemd/system /etc/sudoers.d
  cp -r /repo/unspike/. "$PLUGIN/"
  : > "$CALLS"
}

# Volumio's record of the plugin, as it writes it.
enabled_plugin() {
  cat > "$PLUGINS" << 'JSON'
{
  "system_controller": {
    "unspike": {
      "enabled": {
        "type": "boolean",
        "value": true
      },
      "status": {
        "type": "string",
        "value": "STARTED"
      }
    }
  }
}
JSON
}

installed() {
  [ -f "$UNIT" ] || fail "$1: the unit is not installed"
  cmp -s "$UNIT" "$PLUGIN/systemd/unspike.service" || fail "$1: the unit installed is not the one shipped"
  [ "$(stat -c %a "$UNIT")" = 644 ] || fail "$1: the unit is not 0644"
  [ "$(stat -c %a "$SUDOERS")" = 440 ] || fail "$1: the sudoers entry is not 0440"
  grep -q "/bin/systemctl enable unspike.service, /bin/systemctl disable unspike.service" "$SUDOERS" || fail "$1: the plugin may not switch its unit"
  [ "$(stat -c %U "$PLUGIN/index.js")" = volumio ] || fail "$1: the plugin folder is not volumio's"
  grep -q "^systemctl daemon-reload" "$CALLS" || fail "$1: systemd was not asked to reload"
  grep -q "^visudo -c -f $SUDOERS" "$CALLS" || fail "$1: the sudoers entry was not checked"
}

# --- A fresh install on the kernel the plugin is for. ------------------------
player
out=$(UNSPIKE_KERNEL=6.12.75-v7l+ sh "$PLUGIN/install.sh")
echo "$out" | grep -q "^plugininstallend$" || fail "fresh: the install did not finish: $out"
installed fresh
grep -q "^systemctl enable" "$CALLS" && fail "fresh: the unit was enabled for a plugin nobody has switched on"
echo "$out" | grep -q "6.12.75-v7l+: switch the plugin on and restart the player once" || fail "fresh: no word on what to do next: $out"
echo "ok: a fresh install puts the unit and the sudoers entry in place and enables nothing"

# --- On another kernel it installs, and says it will do nothing. -------------
player
out=$(UNSPIKE_KERNEL=6.12.75-v8+ sh "$PLUGIN/install.sh")
echo "$out" | grep -q "^plugininstallend$" || fail "other kernel: the install did not finish: $out"
installed "other kernel"
echo "$out" | grep -q "6.12.75-v8+, not the one Unspike is for" || fail "other kernel: no word that it does nothing here: $out"
echo "$out" | grep -q "restart the player" && fail "other kernel: asked for a restart that changes nothing"
echo "ok: on another kernel the plugin installs and says it will do nothing"

# --- An update of a plugin in use keeps the unit enabled. --------------------
player
enabled_plugin
out=$(UNSPIKE_KERNEL=6.12.75-v7l+ sh "$PLUGIN/install.sh")
installed update
grep -q "^systemctl enable unspike.service" "$CALLS" || fail "update: the unit was not enabled again"
echo "ok: an update of a plugin in use keeps the unit enabled"

# --- The uninstall takes back everything, and the variable where the unit
# --- set it. -----------------------------------------------------------------
: > "$CALLS"
: > "$MARK"
out=$(sh "$PLUGIN/uninstall.sh")
echo "$out" | grep -q "^pluginuninstallend$" || fail "uninstall: did not finish: $out"
for left in "$UNIT" "$SUDOERS" "$MARK"; do
  [ ! -e "$left" ] || fail "uninstall: $left is still there"
done
grep -q "^systemctl disable unspike.service" "$CALLS" || fail "uninstall: the unit was not disabled"
grep -q "^systemctl unset-environment UV_USE_IO_URING" "$CALLS" || fail "uninstall: the variable the unit set was not taken back"
grep -q "^systemctl daemon-reload" "$CALLS" || fail "uninstall: systemd was not asked to reload"
echo "ok: the uninstall takes back the unit, the sudoers entry and the variable the unit set"

# --- A variable the unit did not set is not the plugin's to take back. -------
player
UNSPIKE_KERNEL=6.12.75-v7l+ sh "$PLUGIN/install.sh" > /dev/null
: > "$CALLS"
sh "$PLUGIN/uninstall.sh" > /dev/null
grep -q "unset-environment" "$CALLS" && fail "no mark: a variable the unit did not set was taken back"
echo "ok: a variable the system set itself is left alone"

# --- A package without its unit is refused, and nothing is left. -------------
player
rm -f "$PLUGIN/systemd/unspike.service"
if out=$(UNSPIKE_KERNEL=6.12.75-v7l+ sh "$PLUGIN/install.sh"); then fail "refusal: an install without the unit went through"; fi
echo "$out" | grep -q "the unit is missing" || fail "refusal: no word why: $out"
[ ! -e "$PLUGIN" ] || fail "refusal: the plugin folder was left behind"
[ ! -e "$SUDOERS" ] || fail "refusal: the sudoers entry was installed"
echo "ok: a package without its unit is refused before anything is installed"

echo "installers: every case passed"
