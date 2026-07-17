const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRick, makeSession } = require('./helpers/rick-dom');

test('teleprompter panel geometry stays inside the camera safe area', () => {
  const { window } = loadRick(makeSession());
  const safe = window.scrGetTeleprompterPanelSafeArea(400, 700);
  const geometry = window.scrConstrainTeleprompterPanelGeometry({
    x: -500,
    y: 900,
    width: 900,
    height: 900,
  }, 400, 700);

  assert.ok(geometry.x >= safe.left);
  assert.ok(geometry.y >= safe.top);
  assert.ok(geometry.x + geometry.width <= safe.right);
  assert.ok(geometry.y + geometry.height <= safe.bottom,
    'the script panel must not overlap the recording controls');
});

test('teleprompter panel minimum size adapts to a narrow preview', () => {
  const { window } = loadRick(makeSession());
  const safe = window.scrGetTeleprompterPanelSafeArea(180, 260);
  const geometry = window.scrConstrainTeleprompterPanelGeometry({
    x: 0,
    y: 0,
    width: 20,
    height: 20,
  }, 180, 260);

  assert.equal(geometry.width, safe.minWidth);
  assert.equal(geometry.height, safe.minHeight);
  assert.ok(geometry.width <= safe.availableWidth);
  assert.ok(geometry.height <= safe.availableHeight);
});

test('teleprompter panel drag and corner resize use the shipped interaction handlers', () => {
  const { window } = loadRick(makeSession());
  const { document } = window;
  const frame = document.createElement('div');
  frame.id = 'rickCameraFrame';
  Object.defineProperty(frame, 'clientWidth', { value: 400 });
  Object.defineProperty(frame, 'clientHeight', { value: 700 });
  const panel = document.createElement('div');
  panel.id = 'rickTeleprompterCopy';
  frame.append(panel);
  document.body.append(frame);
  window.eval('rickState').teleprompter.open = true;

  const event = (x, y) => ({
    button: 0,
    clientX: x,
    clientY: y,
    preventDefault() {},
    stopPropagation() {},
  });
  window.scrSetTeleprompterPanelGeometry({ x: 50, y: 100, width: 280, height: 180 }, frame);
  window.scrStartTeleprompterPanelInteraction(event(100, 120), 'move');
  window.scrMoveTeleprompterPanelInteraction(event(2000, 2000));
  window.scrEndTeleprompterPanelInteraction();

  const safe = window.scrGetTeleprompterPanelSafeArea(400, 700);
  assert.ok(parseFloat(panel.style.left) + parseFloat(panel.style.width) <= safe.right);
  assert.ok(parseFloat(panel.style.top) + parseFloat(panel.style.height) <= safe.bottom);

  const right = parseFloat(panel.style.left) + parseFloat(panel.style.width);
  const bottom = parseFloat(panel.style.top) + parseFloat(panel.style.height);
  window.scrStartTeleprompterPanelInteraction(event(right, bottom), 'nw');
  window.scrMoveTeleprompterPanelInteraction(event(right + 2000, bottom + 2000));
  window.scrEndTeleprompterPanelInteraction();

  assert.equal(parseFloat(panel.style.width), safe.minWidth);
  assert.equal(parseFloat(panel.style.height), safe.minHeight);
  assert.equal(document.documentElement.classList.contains('rick-panel-adjusting'), false);
});
