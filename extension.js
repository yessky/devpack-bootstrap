const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const vscode = require('vscode');
const spawn = require('cross-spawn');

const git = require('./lib/git');
const { window, commands, workspace, Uri } = vscode;

let inProgress = false;
const cachedDirs = new Map();
const cachedRepos = new Map();
const cachedGits = new Map();

function activate(context) {
  context.subscriptions.push(commands.registerCommand('devpack.QAKit.reload', checkAndInstall));

  // check workspace folders and editors
  window.visibleTextEditors.forEach((editor) => startupFile(editor.document.uri));
  workspace.workspaceFolders.forEach((folder) => startupWorkspace(folder.uri));

  // handle events
  context.subscriptions.push(
    workspace.onDidChangeWorkspaceFolders((e) => {
      console.log(['workpsace-folders: ', e]);
    })
  );
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor(() => {
      if (!window.activeTextEditor) return;
      startupFile(window.activeTextEditor.document.uri);
    })
  );
  context.subscriptions.push(
    window.onDidChangeWindowState((e) => {
      if (!e.focused || !e.active || !window.activeTextEditor) return;
      startupFile(window.activeTextEditor.document.uri);
    })
  );
}

function deactivate() {
  cachedDirs.clear();
  cachedRepos.clear();
  cachedGits.clear();
}

function startupFile(uri) {
  const dir = path.dirname(uri.path);
  startupFolder(uri, dir);
}

function startupFolder(uri, dir) {
  dir = dir || uri.path;
  if (uri.scheme !== 'file') return;

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
  if (!repo || !isCompanyRepo(repo)) {
    workspace.fs.readDirectory(uri).then((items) => {
      const folders = items
        .filter((it) => it[1] === 2)
        .map((it) => new Uri(scheme, authority, path.join(dir, it[0])));
      folders.forEach((folder) => startupFolder(folder));
    });
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

function checkAndInstall() {
  if (inProgress) return;
  inProgress = true;
  const localVer = getInstalled('devpack-qa');
  if (!localVer || getLatest('@devpack/qakit') !== localVer) {
    installModule();
  }
}

function installModule() {
  const proc = spawn(
    'npx',
    ['--ignore-existing', '--package', '@devpack/qakit', 'devpack-qa', '-v'],
    {
      encoding: 'utf8',
      windowsHide: true
    }
  );
  proc.on('close', (code) => {
    inProgress = false;
    if (!code) window.setStatusBarMessage('QAKit Ready');
  });
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

module.exports = {
  activate,
  deactivate
};
