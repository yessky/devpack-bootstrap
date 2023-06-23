const vscode = require('vscode');
const { exec, execSync } = require('child_process');
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
  installing = true;
  Promise.all([installCli('eslint', 'eslint'), installCli('devpack-qa', '@devpack/qakit')])
    .then(onBootDone)
    .catch(onBootError);
}

function installCli(name, pkg) {
  let work = installs[name];
  if (!work || !work.promise) {
    work = installs[name] = {};
    work.promise = new Promise((resolve, reject) => {
      if (hasCli(name)) {
        return resolve(name);
      }
      work.task = exec(`npm i -g ${pkg}`, (err) => {
        work.task = null;
        if (err) {
          reject(err);
        } else {
          resolve(name);
        }
      });
    });
  }
  return work.promise;
}

function hasCli(name) {
  let installed = true;
  try {
    execSync(`${name} -v`);
  } catch (err) {
    installed = false;
  }
  return installed;
}

function fixQAKit() {
  // todo
}

function onBootDone() {
  const welcome = 'devpack boot done.';
  installing = false;
  window.setStatusBarMessage(welcome, 2000);
}

function onBootError(err) {
  installing = false;
  window.showErrorMessage('devpack boot failed, as: ' + err);
}

module.exports = {
  activate,
  deactivate
};
