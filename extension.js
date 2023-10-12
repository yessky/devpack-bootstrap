const vscode = require('vscode');
const spawn = require('cross-spawn');
const { window, commands } = vscode;

// work in progress installation
const installs = {};
let installing = false;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  context.subscriptions.push(commands.registerCommand('devpack.BootFix', () => startup(true)));
  context.subscriptions.push(commands.registerCommand('devpack.QAKitFix', fixQAKit));
  startup();
}

function deactivate() {
  Object.keys(installs).forEach((name) => {
    let work = installs[name];
    if (work.task) {
      work.task.kill();
      work.task = null;
    }
    delete installs[name];
  });
}

function startup(fresh) {
  if (!installing && fresh) {
    Object.keys(installs).forEach((name) => {
      installs[name].promise = null;
    });
  }
  onBootStrap();
  Promise.all([
    installOrUpdate('eslint', 'eslint'),
    installOrUpdate('devpack-qa', '@devpack/qakit')
  ])
    .then(onBootDone)
    .catch(onBootError);
}

function installOrUpdate(name, pkg) {
  let work = installs[name];
  if (!work || !work.promise) {
    work = installs[name] = {};
    work.promise = new Promise((resolve, reject) => {
      const action = isInstalled(name) ? 'install' : 'update';
      work.task = spawn(
        'npm',
        [action, '-g', '--force', '--registry', 'https://registry.npmmirror.com', pkg],
        { stdio: 'inherit', windowsHide: true }
      );
      work.task.on('close', (code) => {
        if (code) {
          reject();
        } else {
          resolve(name);
        }
      });
    });
  }
  return work.promise;
}

function isInstalled(name) {
  let installed = true;
  try {
    const out = spawn.sync(name, ['-v'], { encoding: 'utf8' });
    installed = !out.status;
  } catch (err) {
    installed = false;
    console.error(err);
  }
  return installed;
}

function fixQAKit() {
  // todo
}

function onBootStrap() {
  const hint = 'devpack bootstrap ...';
  installing = true;
  window.setStatusBarMessage(hint, 2000);
}

function onBootDone() {
  const hint = 'devpack boot done.';
  installing = false;
  window.setStatusBarMessage(hint, 2000);
}

function onBootError(err) {
  installing = false;
  window.showErrorMessage('devpack boot failed, as:\n' + err);
}

module.exports = {
  activate,
  deactivate
};
