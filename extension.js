const vscode = require('vscode');
const { exec, execSync } = require('child_process');
const { window, commands } = vscode;

// work in progress installation
const installs = {};

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  context.subscriptions.push(commands.registerCommand('devpack.BootFix', startup));
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

function startup() {
  Promise.all([installCli('eslint', 'eslint'), installCli('devpack-qakit', '@devpack/qakit')])
    .then(onBootDone)
    .catch(onBootError);
}

function installCli(name, pkg) {
  let work = installs[name];
  if (!work) {
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
  if (!installed) {
    try {
      execSync(`${name} --help`);
      installed = true;
    } catch (err) {
      installed = false;
    }
  }
  return installed;
}

function fixQAKit() {
  // todo
}

function onBootDone() {
  const welcome = 'devpack boot done.';
  window.setStatusBarMessage(welcome, 2000);
}

function onBootError(err) {
  window.showErrorMessage('devpack boot failed, as: ' + err);
}

module.exports = {
  activate,
  deactivate
};
