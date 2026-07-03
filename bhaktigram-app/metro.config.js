// Metro config — polyfills/shims so matrix-js-sdk resolves under Metro + Hermes.
// E2EE is OFF (we never call initRustCrypto, and the Rust crypto WASM cannot bind
// to Hermes), so `crypto` only needs to satisfy getRandomValues.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  crypto: require.resolve("react-native-get-random-values"),
  events: require.resolve("events"),
  stream: require.resolve("stream-browserify"),
  buffer: require.resolve("buffer"),
  process: require.resolve("process"),
};

module.exports = config;
