const vscode = require('vscode');
const spawn = require('cross-spawn');
const { window, commands, extensions, l10n } = vscode;

// work in progress installation
const installs = {};
let installing = false;
let monitor = {};

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  context.subscriptions.push(commands.registerCommand('devpack.BootFix', () => startup(true)));
  context.subscriptions.push(commands.registerCommand('devpack.QAKitFix', fixQAKit));
  checkExtensions();
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

function checkExtensions() {
  const plugins = {
    ESLint: 'dbaeumer.vscode-eslint',
    Prettier: 'esbenp.prettier-vscode',
    Vetur: 'octref.vetur'
  };
  const missing = Object.keys(plugins).filter((name) => !extensions.getExtension(plugins[name]));
  if (missing.length) {
    window.showWarningMessage(
      l10n.t(
        'Please install required extensions: {0}',
        missing.map((name) => `${name}(${plugins[name]})`).join(', ')
      )
    );
  }
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

function isInstalled(name, pkg) {
  const localVer = getInstalled(name);
  if (!localVer) return false;
  const latestVer = getLatest(pkg);
  return latestVer === localVer;
}

function getInstalled(name) {
  let installed = false;
  try {
    const out = spawn.sync(name, ['-v'], { encoding: 'utf8', windowsHide: true });
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
  reportProgress(100, l10n.t('Ready to use.'));
  setTimeout(hideProgress, 2000);
}

function onBootError(err) {
  hideProgress();
  installing = false;
  window.showErrorMessage(l10n.t('Error occurs, detail:\n{0}', err));
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
