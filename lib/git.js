const path = require('path');
const spawn = require('cross-spawn');

const GIT_GLOBAL_OPTIONS = ['-c', 'submodule.recurse=false'];

exports.exec = execGit;

exports.getRepo = function (cwd = process.cwd()) {
  try {
    const relDir = execGit(['rev-parse', '--show-prefix'], { cwd });
    return determineGitDir(cwd, relDir.trim());
  } catch (err) {
    return null;
  }
};

function execGit(cmd, options = {}) {
  const out = spawn.sync('git', GIT_GLOBAL_OPTIONS.concat(cmd), {
    ...options,
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });

  if (out.status) {
    if (out.error) {
      throw new Error(error);
    }
    if (out.stderr) {
      throw new Error(out.stderr.toString('utf8'));
    }
  }

  return out.stdout.toString('utf8');
}

function determineGitDir(cwd, relDir) {
  if (relDir) {
    relDir = relDir.replace(/[\\/]$/, '').replace(/[\\/]/, path.sep);
  }
  if (relDir) {
    return path.normalize(cwd.substring(0, cwd.lastIndexOf(relDir)));
  } else {
    return path.normalize(cwd);
  }
}

// function parseGitOutput(input) {
//   return input ? input.trim().split(/[\r\n]/) : [];
// }

// function parseGitZOutput(input) {
//   return input ? input.replace(/\u0000$/, '').split('\u0000') : [];
// }
