// Reanimated 4 ships its Babel transform in react-native-worklets; the plugin MUST be listed
// last. Expo had been using its built-in default config — this file makes it explicit so we can
// add the worklets plugin. If Metro caches stale transforms, restart with `--clear`.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
