const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add @/ path alias (matches tsconfig.json paths: "@/*" -> "src/*")
config.resolver.alias = {
  '@': './src',
};

module.exports = config;
