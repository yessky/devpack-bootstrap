const vscode = require('vscode');
const spawn = require('cross-spawn');
const path = require('path');
const git = require('./lib/git');
const { window, commands, l10n } = vscode;

// work in progress installation
const installs = {};
let installing = false;
let monitor = {};

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
  const eslintp = installOrUpdate('eslint', 'eslint');
  const qakitp = installOrUpdate('devpack-qa', '@devpack/qakit');
  const total = 2;
  let remain = 2;
  const checkProgess = () => {
    --remain;
    reportProgress(((total - remain) / total) * 100);
  };
  onBootStrap();
  eslintp.then(checkProgess).catch(onBootError);
  qakitp.then(checkProgess).catch(onBootError);
  return Promise.all([eslintp, qakitp]).then(onBootDone).catch(onBootError);
}

function installOrUpdate(name, pkg) {
  let work = installs[name];
  if (!work || !work.promise) {
    work = installs[name] = {};
    work.promise = new Promise((resolve, reject) => {
      if (isInstalled(name, pkg)) {
        return resolve(name);
      }
      work.task = spawn(
        'npm',
        ['install', '-g', '--force', '--registry', 'https://registry.npmmirror.com', pkg],
        { windowsHide: true }
      );
      work.task.on('close', (code) => {
        if (code) {
          reject(work.stderr.toString());
        } else {
          resolve(name);
        }
      });
    });
  }
  return work.promise;
}

function isInstalled(name, pkg) {
  const localVer = getInstalled(name);
  if (!localVer) return false;
  const latestVer = getLatest(pkg);
  return latestVer === localVer;
}

function getInstalled(name) {
  let installed = false;
  try {
    const out = spawn.sync('npx', ['--no-install', name, '-v'], {
      encoding: 'utf8',
      windowsHide: true
    });
    installed = !out.status && out.stdout.toString().trim();
  } catch (err) {
    installed = false;
    console.error(err);
  }
  return installed;
}

function getLatest(pkg) {
  try {
    const out = spawn.sync('npm', ['view', pkg, 'version'], {
      encoding: 'utf8',
      windowsHide: true
    });
    if (!out.status) return out.stdout.toString().trim();
  } catch (err) {
    console.error(err);
  }
}

function fixQAKit() {
  // todo
}

function onBootStrap() {
  if (installing) return;
  installing = true;
  showProgress();
  reportProgress(0);
}

function onBootDone() {
  installing = false;
  reportProgress(100, l10n.t('Ready to use'));
  setTimeout(hideProgress, 2000);
}

function onBootError(err) {
  hideProgress();
  installing = false;
  window.showErrorMessage(l10n.t('Error occurs, detail:{0}', err || l10n.t('Unknow error')));
}

function showProgress() {
  window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Devpack Bootstrap',
      cancellable: false
    },
    (progress) => {
      return new Promise((resolve) => {
        monitor.progress = progress;
        monitor.resolve = resolve;
      });
    }
  );
}

function reportProgress(val, msg) {
  if (monitor.progress) {
    monitor.progress.report({ increment: val, message: msg || l10n.t('Preparing...') });
  }
}

function hideProgress() {
  if (monitor.resolve) {
    monitor.resolve();
  }
}

module.exports = {
  activate,
  deactivate
};
