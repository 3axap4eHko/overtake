const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏', '⠿'];
const SPINNER_INTERVAL = 100;
const SPINNER_PADDING = 5;

const ACCURACY = 6;

/** TODO
 *  [PROGRESS] script/file.js
 *    Test suite title
 *      ➤ Measure
 *        ✓ Perform
 *        ✕ Perform
 * */

const renderString = (message, x, direction) => {
  const size = message.length;
  process.stdout.moveCursor(0, -1);
  process.stdout.cursorTo(x);
  process.stdout.clearLine(direction);
  if (direction === -1) {
    process.stdout.cursorTo(0);
  }
  process.stdout.write(message);
  process.stdout.moveCursor(-process.stdout.rows, 1);

  return size;
};

const renderSpinner = (index) => renderString(SPINNER[index], 0, -1);

const paddings = [];

const renderMessage = (column, message) => {
  const padding = SPINNER_PADDING + column * 10;
  paddings[column + 1] = renderString(message, padding, 1);
};

export function formatFloat(value, digits = ACCURACY) {
  return parseFloat(value.toFixed(digits));
}

export function defaultReporter(overtake) {
  const spinnerSize = SPINNER.length - 1;
  let i = 0;
  let timerId = null;

  overtake.onLoad.on(() => {});
  overtake.onRun.on(() => {
    console.log();
  });
  overtake.onComplete.on(() => {});
  overtake.onScriptRegister.on(() => {});
  overtake.onScriptStart.on(() => {});
  overtake.onScriptComplete.on(() => {});
  overtake.onSuiteRegister.on(() => {});
  overtake.onSuiteStart.on(() => {});
  overtake.onSuiteComplete.on(() => {});
  overtake.onSetupRegister.on(() => {});
  overtake.onTeardownRegister.on(() => {});
  overtake.onMeasureRegister.on(() => {});
  overtake.onMeasureStart.on((measure) => {
    console.log(measure.title);
  });
  overtake.onMeasureComplete.on(() => {});
  overtake.onPerformRegister.on(() => {});
  overtake.onPerformStart.on((perform) => {
    console.log(perform.title);
    console.log();
    i = 0;
    timerId = setInterval(() => renderSpinner(i++ % spinnerSize), SPINNER_INTERVAL);
  });
  overtake.onPerformComplete.on(() => {
    clearInterval(timerId);
    renderSpinner(spinnerSize);
  });
  overtake.onPerformProgress.on(({ stage, progress }) => {
    renderMessage(0, stage);
    if (typeof progress !== 'undefined') {
      renderMessage(1, `${(progress * 100).toFixed(0)}%`.padStart(4, ' '));
    }
  });
  overtake.onReport.on((report) => {
    if (report.success) {
      renderMessage(2, `total:${report.total.toFixed(0)}ms  mode:${report.mode.toFixed(ACCURACY)}ms`);
    } else {
      renderMessage(1, report.error);
    }
    console.log();
  });
}
