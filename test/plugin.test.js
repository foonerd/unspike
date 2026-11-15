'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// The plugin's file needs two of Volumio's modules, which a player has and
// this test does not, and it runs commands. Each is stood in for: promises
// by the little of kew the plugin uses, the store by nothing, and the
// commands by what a player would print for them.
function wrap(promise) {
    return {
        then: (f) => wrap(promise.then(f)),
        fail: (f) => wrap(promise.catch(f)),
        native: promise
    };
}
const kew = {
    resolve: (value) => wrap(Promise.resolve(value)),
    reject: (error) => wrap(Promise.reject(error)),
    all: (list) => wrap(Promise.all(list.map((p) => p.native))),
    defer: () => {
        const d = {};
        d.promise = wrap(new Promise((resolve, reject) => { d.resolve = resolve; d.reject = reject; }));
        return d;
    }
};
let player;
const commands = {
    exec: (command, options, done) => {
        const callback = typeof options === 'function' ? options : done;
        player.ran.push(command);
        const answer = player.answers(command);
        if (answer === null) {
            callback(new Error('not allowed'), '', 'sudo: a password is required');
        } else {
            callback(null, answer, '');
        }
    }
};
const load = Module._load;
Module._load = function (request) {
    if (request === 'kew') return kew;
    if (request === 'v-conf') return function () { this.loadFile = () => {}; };
    if (request === 'child_process') return commands;
    return load.apply(this, arguments);
};
const Unspike = require('../unspike/index.js');
Module._load = load;

const os = require('node:os');
const strings = require('../unspike/i18n/strings_en.json').UNSPIKE;

// A player: its kernel, whether systemd's environment has the variable, and
// whether it lets the plugin switch its unit.
function standIn(kernel, variableSet, allowed) {
    os.release = () => kernel;
    player = {
        ran: [],
        modals: [],
        toasts: [],
        answers: (command) => {
            if (command.indexOf('/usr/bin/sudo /bin/systemctl ') === 0) return allowed === false ? null : '';
            if (command === '/bin/systemctl show-environment') return variableSet ? 'LANG=C\nUV_USE_IO_URING=0\n' : 'LANG=C\n';
            if (command.indexOf('/bin/systemctl show -p Environment') === 0) return 'Environment=NODE_ENV=production\nEnvironment=\n';
            if (command === '/bin/ps -eLo comm') return 'node\niou-sqp-1264\niou-wrk-1284\n';
            return '';
        }
    };
    const context = {
        coreCommand: {
            loadI18nStrings: () => {},
            getI18nString: (key) => (key.indexOf('UNSPIKE.') === 0 ? strings[key.slice(8)] : key),
            broadcastMessage: (name, message) => player.modals.push({ name: name, message: message }),
            pushToastMessage: (type, title, message) => player.toasts.push({ type: type, message: message }),
            pluginManager: { getConfigurationFile: () => '/dev/null' }
        },
        logger: { info: () => {}, error: () => {} },
        configManager: {}
    };
    return new Unspike(context);
}

test('switched on, the unit is enabled and a restart is asked for where it has yet to do its work', async () => {
    const plugin = standIn('6.12.75-v7l+', false);
    await plugin.onStart().native;
    assert.equal(player.ran[0], '/usr/bin/sudo /bin/systemctl enable unspike.service');
    assert.equal(player.modals.length, 1);
    assert.equal(player.modals[0].name, 'openModal');
    assert.equal(player.modals[0].message.message, strings.RESTART_MSG);
    assert.deepEqual(player.toasts, []);
});

test('on another kernel the unit is enabled all the same, and nobody is asked to restart', async () => {
    const plugin = standIn('6.12.75-v8+', false);
    await plugin.onStart().native;
    assert.equal(player.ran[0], '/usr/bin/sudo /bin/systemctl enable unspike.service');
    assert.deepEqual(player.modals, []);
});

test('where the variable is already set nobody is asked to restart', async () => {
    const plugin = standIn('6.12.75-v7l+', true);
    await plugin.onStart().native;
    assert.deepEqual(player.modals, []);
});

test('a unit that cannot be switched on is said on the page', async () => {
    const plugin = standIn('6.12.75-v7l+', false, false);
    await plugin.onStart().native;
    assert.equal(player.toasts.length, 1);
    assert.equal(player.toasts[0].type, 'error');
    assert.ok(player.toasts[0].message.indexOf('a password is required') !== -1);
    assert.deepEqual(player.modals, []);
});

test('switched off, the unit is disabled', async () => {
    const plugin = standIn('6.12.75-v7l+', true);
    await plugin.onStop().native;
    assert.deepEqual(player.ran, ['/usr/bin/sudo /bin/systemctl disable unspike.service']);
});

test('looking again says what is found now', async () => {
    const plugin = standIn('6.12.75-v7l+', false);
    await plugin.check().native;
    assert.equal(player.toasts.length, 1);
    assert.equal(player.toasts[0].type, 'warning');
    assert.ok(player.toasts[0].message.indexOf('6.12.75-v7l+') !== -1);
    assert.ok(player.toasts[0].message.indexOf(': 2.') !== -1, 'two io_uring threads counted');
    const other = standIn('6.12.75-v8+', false);
    await other.check().native;
    assert.equal(player.toasts[0].type, 'info');
    assert.equal(player.toasts[0].message.indexOf('does nothing here') !== -1, true);
});
