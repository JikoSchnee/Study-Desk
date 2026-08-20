function requestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input?.url ?? "";
}

function isHttpRequest(input) {
  try {
    const protocol = new URL(requestUrl(input)).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function installNetworkFetch({ electronFetch, nativeFetch = globalThis.fetch, target = globalThis } = {}) {
  if (typeof electronFetch !== "function") throw new TypeError("Electron net.fetch is required.");
  if (typeof nativeFetch !== "function") throw new TypeError("A native fetch implementation is required.");

  const fetchWithSystemNetwork = (input, init) => isHttpRequest(input)
    ? electronFetch(input, init)
    : nativeFetch(input, init);

  target.fetch = fetchWithSystemNetwork;
  target.__studyDeskNetworkTransport = "electron";
  target.__studyDeskNativeFetch = nativeFetch;
  return fetchWithSystemNetwork;
}

// This module is loaded only through utilityProcess.fork's --require option.
// Do not rely on process.type here: Electron has varied its value between
// utility-process implementations, while the Electron net module is available.
if (process.versions.electron) {
  const { net } = require("electron");
  installNetworkFetch({ electronFetch: net.fetch.bind(net) });
}

module.exports = { installNetworkFetch, isHttpRequest };
