#!/usr/bin/env node
"use strict";

const cp = require("child_process");
const find = require("lodash.find");
const fs = require("fs");
const minimist = require("minimist");
const path = require("path");

let pkgPath = process.cwd();
let pkgJsonFile = null;
let pkgJson = null;

/** ***************** FIND PACKAGE.JSON ******************/
while (pkgJson === null && path.dirname(pkgPath) !== pkgPath) {
  try {
    pkgJsonFile = path.join(pkgPath, "package.json");
    pkgJson = require(pkgJsonFile);
  } catch (e) {
    pkgPath = path.dirname(pkgPath);
  }
}
if (pkgJson === null) {
  console.log(
    "Could not find a package.json in the current directory or any parent directories."
  );
  console.log("Are you in a node project?");
  process.exit(1);
}
const humanReadablePkgPath = `./${path.relative(process.cwd(), pkgJsonFile)}`;

/** **************** PARSE OUT SCRIPTS FROM PACKAGE.JSON ***********/
const scripts = Object.keys(pkgJson.scripts || {}).map(function(name) {
  return {
    name,
    script: pkgJson.scripts[name]
  };
});
if (scripts.length === 0) {
  console.log(`${pkgJsonFile}: no scripts listed.`);
  process.exit(1);
}

/** ************** FIGURE OUT WHAT SCRIPT TO RUN *****************/
const currentProcessPath = process.argv.slice(0, 2).join(" ");
const argv = minimist(process.argv.slice(2));
let args = argv._ || [];

/** ************* LIST ALL SCRIPTS ON NO INPUT *******************/
const scriptName = args.shift();

if (!scriptName) {
  console.log(`${scripts.length} scripts in ${humanReadablePkgPath}:`);
  scripts.forEach(function(script) {
    console.log(` * ${script.name}`);
  });
  process.exit(0);
}

/** ************* ERROR ******************************************/
const scriptToRun = find(scripts, { name: scriptName });

if (!scriptToRun) {
  console.log(
    `${humanReadablePkgPath}: No script found with name "${scriptName}"`
  );
  process.exit(1);
}

// See : npm help 7 scripts
const scriptToPreRun = find(scripts, {name: "pre"+scriptName});
const scriptToPostRun = find(scripts, {name: "post"+scriptName});

/** ************* RUN SCRIPT *************************************/
process.env.PATH =
  path.join(pkgPath, "node_modules", ".bin") + ":" + process.env.PATH;

args = args.map(function(arg) {
  return `'${arg}'`;
});

function runScript( script ,withArgs ) {
    // convert npm run-script (and all aliases) to nsrun
  script.script = script.script
    .replace(/npm run-script/g, currentProcessPath)
    .replace(/npm run/g, currentProcessPath)
    .replace(/npm test/g, currentProcessPath + " test")
    .replace(/npm start/g, currentProcessPath + " start")
    .replace(/npm stop/g, currentProcessPath + " stop")
    .replace(/npm restart/g, currentProcessPath + " restart");

  let command = "";

  if ( ! withArgs ) {
    command = script.script;
  } else {
    if (/\$[0-9]|\$\*/.test(script.script)) {
      let found = [];

      command = script.script.replace(/(\$[0-9])/g, function(v) {
        v = v.substr(1) - 1;
        if (typeof args[v] === "undefined") return "$" + v++;
        found.push(v);
        return args[v];
      });

      // TODO : Add a --nsrun-no-clear to preserve arguments
      found.map(function(v) {
        args[v] = "";
      });

      command = command.replace(/(\$\*)/, args.join(" "));

      if (/\$[0-9]/.test(command)) {
        console.error(
          `The script (${scriptName}) expected additional positional arguments!`
        );
        process.exit(1);
      }
    } else {
      command = script.script + " " + args.join(" ");
    }
  }

  const child = cp.spawn(command, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: true
  });
  child.on("error", function(err) {
    console.error(err.stack);
  });
  child.on("exit", function(code, signal) {
    process.exit(code);
  });

  [
    "SIGUSR1",
    "SIGTERM",
    "SIGINT",
    "SIGPIPE",
    "SIGHUP",
    "SIGBREAK",
    "SIGWINCH"
  ].map(function(signal) {
    process.on(signal, function() {
      child.kill(signal);
    });
  });
}

scriptToPreRun && runScript( scriptToPreRun ,false );
runScript( scriptToRun ,true );
scriptToPostRun && runScript( scriptToPostRun ,false );