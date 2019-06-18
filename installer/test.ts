// Copyright 2018-2019 the Deno authors. All rights reserved. MIT license.
const { run, stat, makeTempDir, remove, env } = Deno;

import { test, runIfMain, TestFunction } from "../testing/mod.ts";
import { assert, assertEquals, assertThrowsAsync } from "../testing/asserts.ts";
import { BufReader, EOF } from "../io/bufio.ts";
import { TextProtoReader } from "../textproto/mod.ts";
import { install, uninstall } from "./mod.ts";
import * as path from "../fs/path.ts";
import * as fs from "../fs/mod.ts";

let fileServer: Deno.Process;
const isWindows = Deno.platform.os === "win";

// copied from `http/file_server_test.ts`
async function startFileServer(): Promise<void> {
  fileServer = run({
    args: [
      "deno",
      "run",
      "--allow-read",
      "--allow-net",
      "http/file_server.ts",
      ".",
      "--cors"
    ],
    stdout: "piped"
  });
  // Once fileServer is ready it will write to its stdout.
  const r = new TextProtoReader(new BufReader(fileServer.stdout!));
  const s = await r.readLine();
  assert(s !== EOF && s.includes("server listening"));
}

function killFileServer(): void {
  fileServer.close();
  fileServer.stdout!.close();
}

function installerTest(t: TestFunction): void {
  const fn = async (): Promise<void> => {
    await startFileServer();
    const tempDir = await makeTempDir();
    const envVars = env();
    const originalHomeDir = envVars["HOME"];
    envVars["HOME"] = tempDir;

    try {
      await t();
    } finally {
      killFileServer();
      await remove(tempDir, { recursive: true });
      envVars["HOME"] = originalHomeDir;
    }
  };

  test(fn);
}

installerTest(async function installBasic(): Promise<void> {
  await install("file_srv", "http://localhost:4500/http/file_server.ts", []);

  const { HOME } = env();
  const filePath = path.resolve(HOME, ".deno/bin/file_srv");
  const fileInfo = await stat(filePath);
  assert(fileInfo.isFile());

  if (isWindows) {
    assertEquals(
      await fs.readFileStr(filePath + ".cmd"),
      `% This executable is generated by Deno. Please don't modify it unless you know what it means. %
@IF EXIST "%~dp0\deno.exe" (
  "%~dp0\deno.exe" run http://localhost:4500/http/file_server.ts %*
) ELSE (
  @SETLOCAL
  @SET PATHEXT=%PATHEXT:;.TS;=;%
  deno run http://localhost:4500/http/file_server.ts %*
)
`
    );
  }

  assertEquals(
    await fs.readFileStr(filePath),
    `#/bin/sh
# This executable is generated by Deno. Please don't modify it unless you know what it means.
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")

case \`uname\` in
  *CYGWIN*) basedir=\`cygpath -w "$basedir"\`;;
esac

if [ -x "$basedir/deno" ]; then
  "$basedir/deno" run http://localhost:4500/http/file_server.ts "$@"
  ret=$?
else
  deno run http://localhost:4500/http/file_server.ts "$@"
  ret=$?
fi
exit $ret
`
  );
});

installerTest(async function installWithFlags(): Promise<void> {
  await install("file_server", "http://localhost:4500/http/file_server.ts", [
    "--allow-net",
    "--allow-read",
    "--foobar"
  ]);

  const { HOME } = env();
  const filePath = path.resolve(HOME, ".deno/bin/file_server");

  if (isWindows) {
    assertEquals(
      await fs.readFileStr(filePath + ".cmd"),
      `% This executable is generated by Deno. Please don't modify it unless you know what it means. %
@IF EXIST "%~dp0\deno.exe" (
  "%~dp0\deno.exe" run --allow-net --allow-read http://localhost:4500/http/file_server.ts --foobar %*
) ELSE (
  @SETLOCAL
  @SET PATHEXT=%PATHEXT:;.TS;=;%
  deno run --allow-net --allow-read http://localhost:4500/http/file_server.ts --foobar %*
)
`
    );
  }

  assertEquals(
    await fs.readFileStr(filePath),
    `#/bin/sh
# This executable is generated by Deno. Please don't modify it unless you know what it means.
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")

case \`uname\` in
  *CYGWIN*) basedir=\`cygpath -w "$basedir"\`;;
esac

if [ -x "$basedir/deno" ]; then
  "$basedir/deno" run --allow-net --allow-read http://localhost:4500/http/file_server.ts --foobar "$@"
  ret=$?
else
  deno run --allow-net --allow-read http://localhost:4500/http/file_server.ts --foobar "$@"
  ret=$?
fi
exit $ret
`
  );
});

installerTest(async function uninstallBasic(): Promise<void> {
  await install("file_server", "http://localhost:4500/http/file_server.ts", []);

  const { HOME } = env();
  const filePath = path.resolve(HOME, ".deno/bin/file_server");

  await uninstall("file_server");

  assert(!(await fs.exists(filePath)));
  assert(!(await fs.exists(filePath + ".cmd")));
});

installerTest(async function uninstallNonExistentModule(): Promise<void> {
  await assertThrowsAsync(
    async (): Promise<void> => {
      await uninstall("file_server");
    },
    Error,
    "file_server not found"
  );
});

runIfMain(import.meta);