const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

module.exports = async () => {
  execSync('npx prisma migrate deploy', {
    env: process.env,
    stdio: 'inherit',
  });

  execSync('npx ts-node prisma/seed.ts', {
    env: process.env,
    stdio: 'inherit',
  });
};
