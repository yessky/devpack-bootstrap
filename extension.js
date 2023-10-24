const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const vscode = require('vscode');
const spawn = require('cross-spawn');
const git = require('./lib/git');
const { window, commands, workspace, Uri } = vscode;

let inProgress = false;
let store = null;
const ONE_HOUR = 3600000;
const cachePath = '.devpack';
const cachedDirs = new Map();
const cachedRepos = new Map();
const cachedGits = new Map();

function activate(context) {
  store = new XStorage(context);
  context.subscriptions.push(
    commands.registerCommand('devpack.QAKit.reload', () => checkAndInstall(true))
  );
  checkAndInstall(true);

  // // check workspace folders and editors
  // if (window.visibleTextEditors) {
  //   window.visibleTextEditors.forEach((editor) => startupFile(editor.document.uri));
  // }
  // if (workspace.workspaceFolders) {
  //   workspace.workspaceFolders.forEach((folder) => startupWorkspace(folder.uri));
  // }

  // // handle events
  // context.subscriptions.push(
  //   workspace.onDidChangeWorkspaceFolders((e) => {
  //     console.log(['workpsace-folders: ', e]);
  //   })
  // );
  // context.subscriptions.push(
  //   window.onDidChangeActiveTextEditor(() => {
  //     if (!window.activeTextEditor) return;
  //     startupFile(window.activeTextEditor.document.uri);
  //   })
  // );
  // context.subscriptions.push(
  //   window.onDidChangeWindowState((e) => {
  //     if (!e.focused || !e.active || !window.activeTextEditor) return;
  //     startupFile(window.activeTextEditor.document.uri);
  //   })
  // );
}

function deactivate() {
  inProgress = false;
  cachedDirs.clear();
  cachedRepos.clear();
  cachedGits.clear();
  const npmDir = getNpmDir();
  const cacheDir = path.join(npmDir, cachePath);
  if (fs.existsSync(cacheDir)) {
    fs.rmdirSync(cacheDir);
  }
}

// eslint-disable-next-line
function startupFile(uri) {
  const dir = path.dirname(uri.path);
  startupFolder(uri, dir);
}

function startupFolder(uri, dir) {
  dir = dir || uri.path;
  if (uri.scheme !== 'file') return;
  if (inProgress) return;

  // skip if lookuped
  if (cachedDirs.has(dir)) return;
  cachedDirs.set(dir, true);

  // check if it's our repo
  const repo = git.getRepo(dir);
  if (!repo || cachedRepos.has(repo)) return;
  cachedRepos.set(repo, true);
  if (!isCompanyRepo(repo)) return;

  // check and deploy hooks
  checkAndInstall(repo);
}

// eslint-disable-next-line
function startupWorkspace(uri) {
  if (uri.scheme !== 'file') return;

  // skip if lookuped
  const dir = uri.path;
  if (cachedDirs.has(dir)) return;
  cachedDirs.set(dir, true);

  // check if it's git repo, otherwise down to sub directory
  const { scheme, authority } = uri;
  const repo = git.getRepo(dir);
  if (repo && cachedRepos.has(repo)) return;
  if (repo) cachedRepos.set(repo, true);
  if (!repo) {
    workspace.fs.readDirectory(uri).then((items) => {
      const folders = items
        .filter((it) => it[1] === 2)
        .map((it) => new Uri(scheme, authority, path.join(dir, it[0])));
      folders.forEach((folder) => startupFolder(folder));
    });
  } else if (isCompanyRepo(repo)) {
    checkAndInstall();
  }
}

function isCompanyRepo(repo) {
  if (cachedGits.has(repo)) {
    return cachedGits.get(repo);
  }
  const out = execSync(
    "git remote -v | awk '{if(match($3,/push/)&&match($2,/gitlab.seeyon.com/)) print 1}'",
    { cwd: repo, encoding: 'utf8' }
  );
  const flag = out.toString().trim() === '1';
  cachedGits.set(repo, flag);
  return flag;
}

async function checkAndInstall(force) {
  const now = Date.now();
  const lastCheck = store.get('lastCheck');
  if (inProgress) return;
  if (!force && lastCheck && now - lastCheck < ONE_HOUR) return;
  inProgress = true;
  await store.set('lastCheck', now);
  const cacheDir = getCacheDir();
  const localVer = getInstalled('devpack-qa', cacheDir);
  if (!localVer || getLatest('@devpack/qakit') !== localVer) {
    installModule(cacheDir);
  } else {
    inProgress = false;
    window.setStatusBarMessage('QAKit Ready');
  }
}

function installModule(cacheDir) {
  const proc = spawn(
    'npm',
    ['install', '--no-package-lock', '--prefix', cacheDir, '@devpack/qakit'],
    { encoding: 'utf8', windowsHide: true }
  );
  proc.on('close', (code) => {
    inProgress = false;
    if (!code) window.setStatusBarMessage('QAKit Ready');
  });
}

function getInstalled(name, cacheDir) {
  let installed = false;
  try {
    const out = spawn.sync('npx', ['--no-install', name, '-v'], {
      env: {
        ...process.env,
        PATH: `${cacheDir}/node_modules/.bin:${process.env.PATH}`
      },
      shell: true,
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

function getCacheDir() {
  try {
    const out = spawn.sync('echo', [`$HOME/${cachePath}`], {
      shell: true,
      encoding: 'utf8',
      windowsHide: true
    });
    if (!out.status) {
      return out.stdout.toString().trim();
    }
  } catch (err) {
    console.error(err);
  }
  return null;
}

function getNpmDir() {
  try {
    const out = spawn.sync('npm', ['config', 'get', 'prefix'], {
      encoding: 'utf8',
      windowsHide: true
    });
    if (!out.status) {
      return out.stdout.toString().trim();
    }
  } catch (err) {
    console.error(err);
  }
  return null;
}

class XStorage {
  constructor(context) {
    this.context = context;
  }
  get(key) {
    return this.context.globalState.get(key);
  }
  async set(key, val) {
    await this.context.globalState.update(key, val);
    return val;
  }
  async clear(key) {
    await this.context.globalState.update(key, undefined);
    return undefined;
  }
}

module.exports = {
  activate,
  deactivate
};
