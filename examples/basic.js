import { encryptValue, decryptValue, processConfig } from '../src/index.js';

const KEY = process.env.YAMLOCK_KEY || 'dev-secret-key';

function simpleValueDemo() {
  console.log('--- encryptValue / decryptValue ---');
  const payload = encryptValue('swordfish', KEY, 'db.password');
  console.log('Encrypted payload:', payload);
  const original = decryptValue(payload, KEY, 'db.password');
  console.log('Decrypted value:', original);
}

function configDemo() {
  console.log('\n--- processConfig ---');
  const config = {
    db: {
      user: 'app',
      password: 'swordfish'
    }
  };

  const encrypted = processConfig(config, { mode: 'encrypt', key: KEY });
  console.log('Encrypted config:', encrypted);

  const decrypted = processConfig(encrypted, { mode: 'decrypt', key: KEY });
  console.log('Decrypted config:', decrypted);
}

simpleValueDemo();
configDemo();
