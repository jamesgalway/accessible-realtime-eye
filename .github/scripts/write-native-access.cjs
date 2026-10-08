'use strict';
const fs = require('node:fs');
const credential = process.env.HUIYAN_NATIVE_ACCESS_BOOTSTRAP;
if (!/^[a-f0-9]{64}$/.test(credential || '')) throw new Error('Private native authorization is not configured');
fs.writeFileSync('ios-native/AccessibleVision/NativeAccessCredentials.json',
  JSON.stringify({ nativeCredential: credential }), { mode: 0o600 });
