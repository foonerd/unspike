#!/bin/bash
# The workshop pass CI runs: the shell scripts parsed and linted, the
# installer and the uninstaller run in a container, the plugin's files and
# its languages checked, and its JavaScript checked and tested. Run it
# before a commit; nothing ships without it.
set -euo pipefail
ROOT=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT"
PLUGIN=unspike

# The languages a release carries its settings page in, beside English: the
# set the house's other plugins ship.
LANGUAGES="de es fr it ja nl pl pt ru zh"

echo "check: shell scripts"
for script in scripts/*.sh; do
  bash -n "$script" || { echo "check: $script does not parse" >&2; exit 1; }
done
# Volumio runs a plugin's install.sh and uninstall.sh with sh, which is dash.
for script in "$PLUGIN"/install.sh "$PLUGIN"/uninstall.sh test/sandbox.sh; do
  sh -n "$script" || { echo "check: $script does not parse" >&2; exit 1; }
done
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck scripts/*.sh
  shellcheck -s dash "$PLUGIN"/install.sh "$PLUGIN"/uninstall.sh test/sandbox.sh
else
  echo "check: shellcheck is not installed; the shell lint is skipped"
fi
# A script committed without its executable bit fails on someone else's machine.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  for script in scripts/*.sh "$PLUGIN"/install.sh "$PLUGIN"/uninstall.sh; do
    mode=$(git ls-files -s "$script" | cut -d' ' -f1)
    if [ -n "$mode" ] && [ "$mode" != 100755 ]; then
      echo "check: $script is not executable in git (mode $mode)" >&2
      exit 1
    fi
  done
fi

echo "check: installers"
scripts/installers.sh

# Node runs the checks of the plugin's files: here where it is installed,
# else in the node image.
if command -v node >/dev/null 2>&1; then
  with_node() { node "$@"; }
elif command -v docker >/dev/null 2>&1; then
  with_node() { docker run -i --rm -v "$ROOT:/work" -w /work node:20-slim node "$@"; }
else
  echo "check: neither node nor docker found; the plugin's checks are skipped" >&2
  exit 0
fi

echo "check: plugin files"
# Volumio's core reads every plugin's strings at its start: one bad file
# takes the whole backend down, so every JSON the plugin ships must parse,
# as UTF-8 with no byte order mark.
with_node - "$PLUGIN"/package.json "$PLUGIN"/config.json "$PLUGIN"/UIConfig.json "$PLUGIN"/i18n/*.json <<'JS'
const fs = require('fs');
const files = process.argv.slice(2);
for (const file of files) {
  const bytes = fs.readFileSync(file);
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    console.error('check: ' + file + ' starts with a byte order mark');
    process.exit(1);
  }
  try {
    JSON.parse(bytes.toString('utf8'));
  } catch (e) {
    console.error('check: ' + file + ' does not parse: ' + e.message);
    process.exit(1);
  }
}
console.log(files.length + ' plugin files parse');
JS

echo "check: languages"
# A language file is all or nothing: Volumio takes the plugin's block for a
# language whole and does not fall back key by key, so a missing key would
# show as its name. Every file has the keys the English one has, no others,
# and keeps each {{placeholder}}.
with_node - "$PLUGIN"/i18n/strings_en.json "$PLUGIN"/i18n/strings_*.json <<'JS'
const fs = require('fs');
const [english, ...files] = process.argv.slice(2);
const en = JSON.parse(fs.readFileSync(english, 'utf8'));
const block = Object.keys(en)[0];
const keys = Object.keys(en[block]).sort();
const holes = (s) => (String(s).match(/\{\{[a-z]+\}\}/g) || []).sort().join(' ');
let bad = false;
for (const file of files) {
  const other = JSON.parse(fs.readFileSync(file, 'utf8'));
  const theirs = Object.keys(other[block] || {}).sort();
  const missing = keys.filter((k) => !theirs.includes(k));
  const extra = theirs.filter((k) => !keys.includes(k));
  if (Object.keys(other).length !== 1 || missing.length || extra.length) {
    console.error('check: ' + file + ': missing ' + JSON.stringify(missing) + ', extra ' + JSON.stringify(extra));
    bad = true;
    continue;
  }
  for (const k of keys) {
    if (typeof other[block][k] !== 'string' || other[block][k].trim() === '') {
      console.error('check: ' + file + ': ' + k + ' is empty');
      bad = true;
    } else if (holes(other[block][k]) !== holes(en[block][k])) {
      console.error('check: ' + file + ': ' + k + ' does not keep ' + holes(en[block][k]));
      bad = true;
    }
  }
}
if (bad) process.exit(1);
console.log(files.length + ' language files carry the ' + keys.length + ' keys');
JS
for lang in $LANGUAGES; do
  if [ ! -f "$PLUGIN/i18n/strings_$lang.json" ]; then
    echo "check: no strings_$lang.json (a release carries: en $LANGUAGES)" >&2
    exit 1
  fi
done

echo "check: code"
for script in "$PLUGIN"/index.js "$PLUGIN"/lib/*.js test/*.js; do
  with_node --check "$script"
done
with_node --test test/

echo "check: clean"
