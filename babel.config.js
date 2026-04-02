module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // TODO: re-enable after switching back to New Architecture
      // 'react-native-reanimated/plugin',
    ],
  };
};
