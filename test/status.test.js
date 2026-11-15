'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const status = require('../unspike/lib/status');

const MANAGER_SET = 'LANG=C.UTF-8\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin\nUV_USE_IO_URING=0\n';
const MANAGER_BARE = 'LANG=C.UTF-8\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin\n';
const SERVICES_BARE = 'Environment=NODE_ENV=production\nEnvironment=\n';
const SERVICES_SET = 'Environment=NODE_ENV=production UV_USE_IO_URING=0\nEnvironment=\n';
const THREADS = 'systemd\nnode\nnode\niou-sqp-1264\niou-wrk-1284\n  iou-sqp-1278\nnode\n';

test('the kernel the plugin is for is the one whose name ends in -v7l+', () => {
    assert.equal(status.affected('6.12.75-v7l+'), true);
    assert.equal(status.affected('6.1.21-v7l+\n'), true);
    for (const other of ['6.12.75-v8+', '6.12.75-v8-16k+', '6.12.75-v7+', '6.12.75+rpt-rpi-v7l', '6.8.0-45-generic', '', undefined]) {
        assert.equal(status.affected(other), false, String(other));
    }
});

test('the variable is read from systemd\'s own environment and from a unit\'s', () => {
    assert.equal(status.valueIn(MANAGER_SET), '0');
    assert.equal(status.valueIn(MANAGER_BARE), undefined);
    assert.equal(status.valueIn(SERVICES_SET), '0');
    assert.equal(status.valueIn(SERVICES_BARE), undefined);
    assert.equal(status.valueIn('Environment=UV_USE_IO_URING=1'), '1');
    assert.equal(status.valueIn('NOT_UV_USE_IO_URING=0'), undefined, 'another variable that ends the same');
    assert.equal(status.valueIn(undefined), undefined);
});

test('io_uring\'s threads are counted by their names', () => {
    assert.equal(status.uringThreads(THREADS), 3);
    assert.equal(status.uringThreads('node\nsystemd\n'), 0);
    assert.equal(status.uringThreads(''), 0);
});

test('on another kernel the plugin does nothing, whatever else is so', () => {
    const found = status.state({ release: '6.12.75-v8+', manager: MANAGER_BARE, services: SERVICES_BARE, threads: THREADS, mark: false });
    assert.deepEqual(found, { code: 'not_needed', kernel: '6.12.75-v8+', threads: 3 });
    assert.equal(status.state({ release: '6.12.75-v8+', manager: MANAGER_SET, mark: true }).code, 'not_needed');
});

test('the guard that set the variable at this start is at work', () => {
    const found = status.state({ release: '6.12.75-v7l+', manager: MANAGER_SET, services: SERVICES_BARE, threads: 'node\n', mark: true });
    assert.deepEqual(found, { code: 'active', kernel: '6.12.75-v7l+', threads: 0 });
});

test('a system that sets the variable itself needs no guard', () => {
    // In the player's own unit, where a fix in the system would put it.
    assert.equal(status.state({ release: '6.12.75-v7l+', manager: MANAGER_BARE, services: SERVICES_SET, mark: false }).code, 'system');
    // Or in systemd's environment, by something that is not this plugin.
    assert.equal(status.state({ release: '6.12.75-v7l+', manager: MANAGER_SET, services: SERVICES_BARE, mark: false }).code, 'system');
});

test('a guard that has not run yet works from the next start', () => {
    const found = status.state({ release: '6.12.75-v7l+', manager: MANAGER_BARE, services: SERVICES_BARE, threads: THREADS, mark: false });
    assert.deepEqual(found, { code: 'pending', kernel: '6.12.75-v7l+', threads: 3 });
    // A mark with no variable behind it is not a guard at work.
    assert.equal(status.state({ release: '6.12.75-v7l+', manager: MANAGER_BARE, services: SERVICES_BARE, mark: true }).code, 'pending');
});

test('a state is said in the page\'s own words, with the kernel and the threads in them', () => {
    const strings = require('../unspike/i18n/strings_en.json').UNSPIKE;
    const words = { not_needed: strings.STATE_NOT_NEEDED, active: strings.STATE_ACTIVE, system: strings.STATE_SYSTEM, pending: strings.STATE_PENDING };
    for (const code of Object.keys(words)) {
        const said = status.sentence({ code: code, kernel: '6.12.75-v7l+', threads: 7 }, words);
        assert.ok(said.indexOf('6.12.75-v7l+') !== -1, code);
        assert.ok(said.indexOf('{{') === -1, code + ': ' + said);
    }
    assert.ok(status.sentence({ code: 'active', kernel: 'k', threads: 0 }, words).indexOf(': 0.') !== -1);
    assert.equal(status.sentence({ code: 'unknown', kernel: 'k', threads: 0 }, words), '');
});
