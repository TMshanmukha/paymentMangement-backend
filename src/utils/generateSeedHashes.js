/**
 * Run with: npm run seed:hash
 * Prints bcrypt hashes for the demo password so you can paste them into
 * database.sql (or run the printed UPDATE statements directly) — the seed
 * rows in database.sql ship with placeholder hashes that will not work
 * until you run this once.
 */
import bcrypt from 'bcrypt';

const DEMO_PASSWORD = 'Vedaeduhunt@1';
const USERNAMES = ['VEDAVYAS', 'school.accountant', 'tuition.accountant'];

async function main() {
  console.log(`Generating bcrypt hashes for password: ${DEMO_PASSWORD}\n`);
  for (const username of USERNAMES) {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    console.log(`UPDATE users SET password_hash = '${hash}' WHERE username = '${username}';`);
  }
  console.log('\nRun the above statements against your database, then log in with any username above + password.');
}

main();
