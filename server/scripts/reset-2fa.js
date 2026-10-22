// Turn off 2-step sign-in for one account (lost phone AND lost recovery codes).
// On the server, from the project folder:
//   docker compose exec app node scripts/reset-2fa.js you@example.com
// The account can then sign in with its password and set 2-step up again.
import { one, pool } from '../src/db.js';
import { disableTwoFactor } from '../src/twofactor.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: node scripts/reset-2fa.js <email>');
  process.exit(1);
}
const user = await one('SELECT id, email FROM users WHERE email = $1', [email]);
if (!user) {
  console.error(`No account with email ${email}`);
  process.exit(1);
}
await disableTwoFactor(user.id);
console.log(`2-step sign-in turned off for ${user.email}. Sign in with the password and set it up again.`);
await pool.end();
