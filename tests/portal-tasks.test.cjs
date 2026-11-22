const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { createContext, runInContext } = require('node:vm');

const html = readFileSync(join(__dirname, '../docs/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const startup = script.lastIndexOf('\nseedPortalTasks();');
assert.ok(startup >= 0, 'Expected the browser startup call');

function storage(entries = []) {
  const values = new Map(entries);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

for (const [kind, account, action] of [
  ['cleaning', 'clean', 'clean'],
  ['maintenance', 'maint', 'maint']
]) {
  test(kind + ' actions only affect the bed paired with a duplicate task ID', () => {
    const task = (id, bed) => ({ id, bed, kind, status: 'pending' });
    const bed = id => ({ id, status: kind, clean: false, equipment: kind === 'cleaning' });
    const fixture = {
      beds: [bed('A'), bed('B')],
      departmentTasks: [task('duplicate', 'A'), task('duplicate', 'B'), task('only-A', 'A')],
      alerts: [],
      logs: []
    };
    const localStorage = storage();
    const getFixture = () => JSON.parse(localStorage.getItem('hospital-bed-ipad-v2'));
    const button = {
      dataset: { portalAction: action, task: 'duplicate', bed: 'B' },
      addEventListener(_, listener) { this.click = listener; }
    };
    const context = createContext({
      structuredClone,
      localStorage,
      sessionStorage: storage([
        ['hospital-demo-account', account],
        ['hospital-bed-view-session', 'yes']
      ]),
      document: {
        addEventListener() {},
        getElementById: () => ({ addEventListener() {} }),
        querySelectorAll: () => [button]
      },
      window: { matchMedia: () => ({ addEventListener() {} }) },
      alert: message => assert.fail(message),
      fixture
    });
    const run = source => runInContext(source, context);
    run(script.slice(0, startup));
    run('db = fixture; render = () => {}; persist(); bindPortalActions();');

    const before = getFixture();
    button.dataset.task = 'only-A';
    button.click();
    assert.deepEqual(getFixture(), before, 'Reject a task ID paired with a different bed');
    button.dataset.task = 'duplicate';
    delete button.dataset.bed;
    button.click();
    assert.deepEqual(getFixture(), before, 'Reject a task without a bed ID');

    button.dataset.bed = 'B';
    button.click();
    assert.deepEqual(getFixture().departmentTasks.slice(0, 2).map(t => t.status), ['pending', 'working']);

    button.click();
    const completed = getFixture();
    assert.deepEqual(completed.beds[0], before.beds[0]);
    assert.equal(completed.departmentTasks.find(t => t.id === 'duplicate' && t.bed === 'A').status, 'pending');
    assert.equal(completed.departmentTasks.find(t => t.id === 'duplicate' && t.bed === 'B').status, 'done');
    assert.equal(completed.beds[1].status, 'cleaning');
    assert.equal(completed.beds[1].clean, kind === 'cleaning');
    assert.equal(completed.beds[1].equipment, true);
    if (kind === 'maintenance') {
      assert.deepEqual(completed.departmentTasks.filter(t => t.kind === 'cleaning').map(t => t.bed), ['B']);
    }
    button.click();
    assert.deepEqual(getFixture(), completed, 'Ignore a repeated action on a completed task');
  });
}
