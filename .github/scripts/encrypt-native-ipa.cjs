'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const rawKey = process.env.HUIYAN_NATIVE_IPA_ENCRYPTION_KEY;
if (!/^[a-f0-9]{64}$/.test(rawKey || '')) throw new Error('Private IPA encryption is not configured');
const nonce = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(rawKey, 'hex'), nonce);
const encrypted = Buffer.concat([cipher.update(fs.readFileSync(process.argv[2])), cipher.final()]);
fs.writeFileSync(process.argv[3], Buffer.concat([Buffer.from('HUIYAN-IPAV1'), nonce, cipher.getAuthTag(), encrypted]));
