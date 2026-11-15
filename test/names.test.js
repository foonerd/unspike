'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const plugin = path.join(__dirname, '..', 'unspike');
const read = (file) => fs.readFileSync(path.join(plugin, file), 'utf8');
const pkg = JSON.parse(read('package.json'));

const STORE_NAME = 'unspike';
const CATEGORY = 'system_controller';

test('the plugin is one thing by one name: its folder, its store name and its endpoint', () => {
    assert.equal(pkg.name, STORE_NAME);
    assert.equal(path.basename(plugin), STORE_NAME);
    assert.equal(pkg.volumio_info.plugin_type, CATEGORY);
    const endpoints = read('UIConfig.json').match(/"endpoint":\s*"[^"]*"/g) || [];
    assert.ok(endpoints.length > 0);
    endpoints.forEach((endpoint) => {
        assert.ok(endpoint.indexOf('"' + CATEGORY + '/' + STORE_NAME + '"') !== -1, endpoint);
    });
    assert.ok(read('install.sh').indexOf('PLUGIN_DIR="/data/plugins/' + CATEGORY + '/' + STORE_NAME + '"') !== -1);
});

test('the store is given what it asks of a plugin', () => {
    for (const field of ['description', 'author', 'license', 'repository']) {
        assert.ok(pkg[field], field);
    }
    assert.deepEqual(pkg.volumio_info.os, ['bookworm']);
    assert.deepEqual(pkg.volumio_info.architectures, ['armhf']);
    assert.ok(/^\d+\.\d+\.\d+$/.test(pkg.version));
    assert.ok(pkg.volumio_info.changelog.indexOf(pkg.version) === 0, 'the changelog line is this version\'s');
    assert.ok(/echo "plugininstallend"\s*$/.test(read('install.sh')), 'the installer ends by saying so');
    assert.ok(/echo "pluginuninstallend"\s*$/.test(read('uninstall.sh')), 'and the uninstaller');
});

// The unit is the plugin. What it must be to do no harm: kept to the one
// kernel, before the player's services, and silent where the system has
// its own say.
test('the unit runs on the one kernel, before the player\'s services, and defers to the system', () => {
    const unit = read('systemd/unspike.service');
    const line = (key) => unit.split('\n').filter((l) => l.indexOf(key + '=') === 0);
    assert.deepEqual(line('ConditionKernelVersion'), ['ConditionKernelVersion=*-v7l+']);
    assert.deepEqual(line('Before'), ['Before=volumio.service wireless.service']);
    assert.deepEqual(line('DefaultDependencies'), ['DefaultDependencies=no']);
    assert.deepEqual(line('Type'), ['Type=oneshot']);
    assert.deepEqual(line('WantedBy'), ['WantedBy=sysinit.target']);
    const start = line('ExecStart');
    assert.equal(start.length, 1);
    assert.ok(start[0].indexOf('show-environment | grep -q "^UV_USE_IO_URING="') !== -1, 'looks in systemd\'s environment first');
    assert.ok(start[0].indexOf('show -p Environment volumio.service wireless.service | grep -q "UV_USE_IO_URING="') !== -1, 'and in the player\'s units');
    assert.ok(start[0].indexOf('set-environment UV_USE_IO_URING=0') !== -1);
    assert.ok(start[0].indexOf('%') === -1, 'nothing systemd would take for a specifier');
});

test('the mark the unit leaves is the one the plugin and the uninstaller look for', () => {
    const mark = '/run/unspike.set';
    assert.ok(read('systemd/unspike.service').indexOf(': > ' + mark) !== -1);
    assert.ok(read('index.js').indexOf("var MARK = '" + mark + "';") !== -1);
    assert.ok(read('uninstall.sh').indexOf('MARK="${UNSPIKE_MARK:-' + mark + '}"') !== -1);
});

test('the page, its strings and the plugin\'s code agree on what is said', () => {
    const strings = JSON.parse(read('i18n/strings_en.json')).UNSPIKE;
    const used = new Set();
    (read('UIConfig.json').match(/TRANSLATE\.UNSPIKE\.[A-Z_]+/g) || []).forEach((k) => used.add(k.split('.')[2]));
    (read('index.js').match(/'UNSPIKE\.[A-Z_]+'/g) || []).forEach((k) => used.add(k.replace(/'/g, '').split('.')[1]));
    for (const key of used) {
        assert.ok(key in strings, key + ' is used and has no string');
    }
    for (const key of Object.keys(strings)) {
        assert.ok(used.has(key), key + ' has a string and is not used');
    }
});
