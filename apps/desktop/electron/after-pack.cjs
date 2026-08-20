const { join } = require("node:path");
const { verifyNativeAddon } = require("./verify-native.cjs");

function packagedPaths(context) {
  const productFilename = context.packager.appInfo.productFilename;
  if (context.electronPlatformName === "darwin") {
    const appRoot = join(context.appOutDir, `${productFilename}.app`, "Contents");
    return {
      executable: join(appRoot, "MacOS", productFilename),
      resources: join(appRoot, "Resources"),
    };
  }
  return {
    executable: join(context.appOutDir, context.electronPlatformName === "win32" ? `${productFilename}.exe` : productFilename),
    resources: join(context.appOutDir, "resources"),
  };
}

module.exports = async function afterPack(context) {
  const { executable, resources } = packagedPaths(context);
  const modulePath = join(resources, "next", "node_modules", "better-sqlite3");
  verifyNativeAddon(executable, modulePath, {
    cwd: context.appOutDir,
    runtimeName: `${context.electronPlatformName} packaged Electron`,
  });
};
